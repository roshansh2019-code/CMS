"""
ai_data.py
Fetches ONE student's own data and computes their academic metrics.
Schema matches the queries already used in server.py
(/student-results, /student-fees, /student-attendance-summary).
This module never accepts an arbitrary student id from the AI or from
free text — the roll is resolved once, server-side, from the verified
caller, and every query below is scoped to that roll only.
"""

from db import get_db

# ---- Adjust this table to match your grading scale -------------------
# marks are assumed to be out of 100 per subject.
def marks_to_grade_point(marks):
    if marks is None:
        return 0.0
    m = float(marks)
    if m >= 90: return 4.0
    if m >= 80: return 3.6
    if m >= 70: return 3.2
    if m >= 60: return 2.8
    if m >= 50: return 2.4
    if m >= 40: return 2.0
    return 0.0  # fail


def get_student_profile(cursor, roll):
    cursor.execute(
        """
        SELECT full_name, roll, email, phone, department, dob,
               semester, `year`, is_verified
        FROM users
        WHERE roll=%s AND role='student'
        """,
        (roll,)
    )
    return cursor.fetchone()


def get_student_results(cursor, roll):
    # Same columns as GET /student-results/<roll> in server.py.
    # Only VERIFIED results count toward GPA/CGPA — unverified rows are
    # pending review and shouldn't be presented as final numbers.
    cursor.execute(
        """
        SELECT subject_name, marks, exam_term, semester, verified
        FROM results
        WHERE roll=%s
        ORDER BY created_at DESC
        """,
        (roll,)
    )
    rows = cursor.fetchall() or []
    return [r for r in rows if bool(r.get("verified"))]


def get_student_attendance(cursor, roll):
    # attendance stores monthly AGGREGATES, not per-day rows
    # (matches GET /student-attendance-summary/<roll> in server.py).
    cursor.execute(
        """
        SELECT SUM(total_present) AS present,
               SUM(total_absent)  AS absent,
               SUM(total_holiday) AS holiday
        FROM attendance
        WHERE roll=%s
        """,
        (roll,)
    )
    row = cursor.fetchone() or {}
    present = int(row.get("present") or 0)
    absent = int(row.get("absent") or 0)
    return present, absent


def get_student_fees(cursor, roll):
    # Table is `student_fees`, matches GET /student-fees/<roll> in server.py.
    cursor.execute(
        """
        SELECT total_fee, amount_paid, due_amount, payment_date
        FROM student_fees
        WHERE roll=%s
        ORDER BY payment_date ASC
        """,
        (roll,)
    )
    return cursor.fetchall() or []


def get_student_notices(cursor, roll, department):
    """
    Best-effort guess at your notices schema based on how the frontend
    calls /notice/event and /notice/exam. Adjust table/column names to
    match your real notices table — the rest of this file doesn't
    depend on it, and this fails safe (returns []) if the table/columns
    don't match.
    """
    try:
        cursor.execute(
            """
            SELECT title, message, created_at
            FROM notices
            WHERE department_code=%s OR department_code IS NULL
            ORDER BY created_at DESC
            LIMIT 5
            """,
            (department,)
        )
        return cursor.fetchall() or []
    except Exception:
        return []


def get_ml_prediction(roll):
    """
    Hook into your existing AI Result Report / ML prediction system
    (routes/ai_report_route.py, registered as ai_report_bp in server.py).
    Replace the import/function below with whatever that module
    actually exposes for a single-student prediction. Wrapped in
    try/except so the chatbot degrades gracefully if it doesn't match.
    """
    try:
        from routes.ai_report_route import predict_student_performance
        return predict_student_performance(roll)
    except Exception:
        return None


def build_student_context(roll):
    """
    Single entry point: returns a dict of ALREADY-COMPUTED, trustworthy
    facts about one student. This dict is what gets shown to the AI —
    never raw DB rows, never other students' data.
    """
    db = get_db()
    if db is None:
        raise RuntimeError("Database connection failed")

    try:
        cursor = db.cursor(dictionary=True)

        profile = get_student_profile(cursor, roll)
        if not profile:
            return None

        results = get_student_results(cursor, roll)
        present, absent = get_student_attendance(cursor, roll)
        fees = get_student_fees(cursor, roll)
        notices = get_student_notices(cursor, roll, profile.get("department"))

        # ---- Group results by exam_term/semester for GPA ----
        terms = {}
        for r in results:
            key = (r["exam_term"], r["semester"])
            terms.setdefault(key, []).append(r)

        term_summaries = []
        all_gp = []
        subject_avg = {}  # subject_name -> [marks,...]

        for (exam_term, semester), rows in terms.items():
            gps = [marks_to_grade_point(r["marks"]) for r in rows]
            term_gpa = round(sum(gps) / len(gps), 2) if gps else 0.0
            all_gp.extend(gps)
            failed = any(float(r["marks"] or 0) < 40 for r in rows)
            term_summaries.append({
                "exam_term": exam_term,
                "semester": semester,
                "gpa": term_gpa,
                "failed_any_subject": failed,
                "subjects": [
                    {"name": r["subject_name"], "marks": float(r["marks"] or 0)}
                    for r in rows
                ],
            })
            for r in rows:
                subject_avg.setdefault(r["subject_name"], []).append(float(r["marks"] or 0))

        cgpa = round(sum(all_gp) / len(all_gp), 2) if all_gp else None

        subject_averages = {
            name: round(sum(vals) / len(vals), 2) for name, vals in subject_avg.items()
        }
        weakest_subject = min(subject_averages, key=subject_averages.get) if subject_averages else None
        strongest_subject = max(subject_averages, key=subject_averages.get) if subject_averages else None

        # ---- Attendance ----
        total_att = present + absent
        attendance_pct = round((present / total_att) * 100, 1) if total_att else None

        # ---- Fees ----
        total_fee = float(fees[0]["total_fee"]) if fees else 0
        total_paid = sum(float(f.get("amount_paid") or 0) for f in fees)
        due_amount = float(fees[-1].get("due_amount") or 0) if fees else 0

        ml_prediction = get_ml_prediction(roll)

        return {
            "profile": {
                "name": profile["full_name"],
                "roll": profile["roll"],
                "department": profile["department"],
                "semester": profile.get("semester") or profile.get("year"),
                "email": profile["email"],
            },
            "cgpa": cgpa,
            "terms": term_summaries,
            "subject_averages": subject_averages,
            "weakest_subject": weakest_subject,
            "strongest_subject": strongest_subject,
            "attendance": {
                "present": present,
                "absent": absent,
                "percentage": attendance_pct,
            },
            "fees": {
                "total_fee": total_fee,
                "total_paid": total_paid,
                "due_amount": due_amount,
            },
            "notices": [
                {"title": n["title"], "message": n["message"]} for n in notices
            ],
            "ml_prediction": ml_prediction,
        }
    finally:
        try:
            cursor.close()
            db.close()
        except Exception:
            pass