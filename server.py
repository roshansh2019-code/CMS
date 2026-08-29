from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os
import mysql.connector

load_dotenv()  # must run BEFORE ai_chat (and anything else reading env vars) is imported

from routes.department_route import department_bp
from routes.auth_route        import auth_bp
from routes.subject_route     import subject_bp
from routes.student_route     import student_bp
from routes.teacher_route     import teacher_bp
from routes.result_route      import result_bp
from routes.attendance_route  import attendance_route
from routes.fee_route         import fee_api
from routes.notice_route      import notice_bp
from routes.search_route      import search_bp
from routes.ai_report_route   import ai_report_bp  # NEW: AI Result Report
from routes.profile_route     import profile_bp
from ai_chat                  import ai_chat_bp      # NEW: AI Chat Assistant

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

app.register_blueprint(auth_bp)
app.register_blueprint(department_bp)
app.register_blueprint(subject_bp)
app.register_blueprint(student_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(result_bp)
app.register_blueprint(attendance_route)
app.register_blueprint(fee_api)
app.register_blueprint(notice_bp)
app.register_blueprint(search_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(ai_report_bp)  
app.register_blueprint(ai_chat_bp)

def get_db():
    try:
        return mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="college_system"
        )
    except Exception as e:
        print("DB ERROR:", e)
        return None


@app.route("/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB connection failed"}), 500

    cur = conn.cursor(dictionary=True)

    def one(sql, p=()):
        cur.execute(sql, p)
        return cur.fetchone() or {}

    def many(sql, p=()):
        cur.execute(sql, p)
        return cur.fetchall()

    overview = {
        "students":    int(one("SELECT COUNT(*) AS c FROM users WHERE role='student'") .get("c", 0)),
        "teachers":    int(one("SELECT COUNT(*) AS c FROM users WHERE role='teacher'") .get("c", 0)),
        "departments": int(one("SELECT COUNT(*) AS c FROM departments")                 .get("c", 0)),
        "subjects":    int(one("SELECT COUNT(*) AS c FROM subjects")                  .get("c", 0)),
    }

    s_verified   = int(one("SELECT COUNT(*) AS c FROM users WHERE role='student' AND is_verified=1").get("c", 0))
    s_unverified = int(one("SELECT COUNT(*) AS c FROM users WHERE role='student' AND is_verified=0").get("c", 0))
    students = {
        "total":       overview["students"],
        "verified":   s_verified,
        "unverified": s_unverified,
    }

    t_verified   = int(one("SELECT COUNT(*) AS c FROM users WHERE role='teacher' AND is_verified=1").get("c", 0))
    t_unverified = int(one("SELECT COUNT(*) AS c FROM users WHERE role='teacher' AND is_verified=0").get("c", 0))
    teachers = {
        "total":       overview["teachers"],
        "verified":   t_verified,
        "unverified": t_unverified,
    }
    dept_rows = many("""
        SELECT d.department_name AS name,
               COUNT(u.id)       AS student_count
        FROM   departments d
        LEFT JOIN users u
               ON u.department = d.department_name
              AND u.role = 'student'
        GROUP  BY d.department_name
        ORDER  BY student_count DESC
    """)

    subj_rows = many("""
        SELECT d.department_name AS department,
               COUNT(s.id)       AS subject_count
        FROM   departments d
        LEFT JOIN subjects s ON s.department_code = d.department_code
        GROUP  BY d.department_name
        ORDER  BY subject_count DESC
    """)

    cur.close()
    conn.close()

    result = {
        "overview":        overview,
        "students":        students,
        "teachers":        teachers,
        "departments":      [{"name": r["name"], "student_count": int(r["student_count"])} for r in dept_rows],
        "subjects_by_dept": [{"department": r["department"], "subject_count": int(r["subject_count"])} for r in subj_rows],
    }
    print("Dashboard →", result)
    return jsonify(result)


@app.route("/teacher-dashboard/<employee_id>", methods=["GET"])
def teacher_dashboard(employee_id):
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB connection failed"}), 500

    cur = conn.cursor(dictionary=True)

    def one(sql, p=()):
        cur.execute(sql, p)
        return cur.fetchone() or {}

    def many(sql, p=()):
        cur.execute(sql, p)
        return cur.fetchall()

    teacher = one("""
        SELECT full_name, department, email, phone
        FROM   users
        WHERE  employee_id=%s AND role='teacher'
    """, (employee_id,))

    overview = {
        "subjects_taught": int(one(
            "SELECT COUNT(DISTINCT subject_id) AS c FROM results WHERE employee_id=%s",
            (employee_id,)
        ).get("c", 0)),
        "students_evaluated": int(one(
            "SELECT COUNT(DISTINCT roll) AS c FROM results WHERE employee_id=%s",
            (employee_id,)
        ).get("c", 0)),
        "results_entered": int(one(
            "SELECT COUNT(*) AS c FROM results WHERE employee_id=%s",
            (employee_id,)
        ).get("c", 0)),
    }

    pass_count = int(one(
        "SELECT COUNT(*) AS c FROM results WHERE employee_id=%s AND marks>=40",
        (employee_id,)
    ).get("c", 0))
    fail_count = int(one(
        "SELECT COUNT(*) AS c FROM results WHERE employee_id=%s AND marks<40",
        (employee_id,)
    ).get("c", 0))

    subject_rows = many("""
        SELECT subject_name,
               COUNT(*)   AS result_count,
               AVG(marks) AS avg_marks
        FROM   results
        WHERE  employee_id=%s
        GROUP  BY subject_name
        ORDER  BY result_count DESC
    """, (employee_id,))

    term_rows = many("""
        SELECT exam_term, COUNT(*) AS result_count
        FROM   results
        WHERE  employee_id=%s
        GROUP  BY exam_term
        ORDER  BY result_count DESC
    """, (employee_id,))

    cur.close()
    conn.close()

    result = {
        "teacher":   teacher,
        "overview":  overview,
        "results_status": {"pass": pass_count, "fail": fail_count},
        "subject_wise": [
            {
                "subject_name": r["subject_name"],
                "result_count": int(r["result_count"]),
                "avg_marks":    round(float(r["avg_marks"] or 0), 1),
            } for r in subject_rows
        ],
        "exam_term_wise": [
            {"exam_term": r["exam_term"], "result_count": int(r["result_count"])} for r in term_rows
        ],
    }
    print("Teacher Dashboard →", result)
    return jsonify(result)


@app.route("/student-results/<roll>", methods=["GET"])
def get_student_results(roll):
    conn = get_db()
    if not conn:
        return jsonify([])
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, roll, studentName, employee_id, employee_name,
               department_code, department_name, semester,
               subject_id, subject_name, marks, exam_term,
               verified, created_at
        FROM results WHERE roll=%s ORDER BY created_at DESC
    """, (roll,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    for r in rows:
        r["marks"]      = float(r["marks"]) if r["marks"] else 0
        r["verified"]   = bool(r["verified"])
        r["created_at"] = str(r["created_at"])
    return jsonify(rows)


@app.route("/student-fees/<roll>", methods=["GET"])
def get_student_fees(roll):
    conn = get_db()
    if not conn:
        return jsonify([])
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, roll, student_name, department_code, department_name,
               semester_year, total_fee, amount_paid, due_amount,
               payment_method, payment_date, remarks
        FROM student_fees WHERE roll=%s ORDER BY payment_date ASC
    """, (roll,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    for f in rows:
        f["total_fee"]    = float(f["total_fee"])   if f["total_fee"]   else 0
        f["amount_paid"]  = float(f["amount_paid"]) if f["amount_paid"] else 0
        f["due_amount"]   = float(f["due_amount"])  if f["due_amount"]  else 0
        f["payment_date"] = str(f["payment_date"])
    return jsonify(rows)


@app.route("/student-attendance-summary/<roll>", methods=["GET"])
def get_attendance_summary(roll):
    conn = get_db()
    if not conn:
        return jsonify({"present": 0, "absent": 0, "holiday": 0})
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT SUM(total_present) AS present,
               SUM(total_absent)  AS absent,
               SUM(total_holiday) AS holiday
        FROM attendance WHERE roll=%s
    """, (roll,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({
        "present": int(row["present"] or 0),
        "absent":  int(row["absent"]  or 0),
        "holiday": int(row["holiday"] or 0),
    })


@app.route("/student-attendance-monthly/<roll>", methods=["GET"])
def get_attendance_monthly(roll):
    conn = get_db()
    if not conn:
        return jsonify([])
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT month, years,
               SUM(total_present) AS present,
               SUM(total_absent)  AS absent,
               SUM(total_holiday) AS holiday
        FROM attendance
        WHERE roll=%s
        GROUP BY month, years
        ORDER BY years ASC, month ASC
    """, (roll,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    result = []
    for r in rows:
        m = int(r["month"]) if r["month"] else 0
        y = int(r["years"]) if r["years"] else 0
        label = f"{month_names[m]} {y}" if 0 < m <= 12 else f"{m}-{y}"
        result.append({
            "month_label": label,
            "month": m,
            "year": y,
            "present": int(r["present"] or 0),
            "absent": int(r["absent"] or 0),
            "holiday": int(r["holiday"] or 0),
        })
    return jsonify(result)


@app.route("/")
def home():
    return jsonify({"success": True, "message": "CMS Backend Running"})

@app.route("/health")
def health():
    return jsonify({"success": True, "status": "Running", "port": 5000})

@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "message": "Route Not Found"}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({"success": False, "message": "Internal Server Error", "error": str(error)}), 500


if __name__ == "__main__":
    print("=" * 55)
    print("  CMS Backend Running → http://127.0.0.1:5000")
    print("  Profile endpoints:")
    print("    GET  /profile/<id>")
    print("    PUT  /profile/<id>")
    print("    PUT  /profile/<id>/password")
    print("    POST /profile/<id>/image")
    print("  AI Result Report endpoints:")
    print("    POST /ai/generate-result-report")
    print("    POST /ai/download-report-pdf")
    print("  AI Assistant endpoint:")
    print("    POST /ai/chat")
    print("=" * 55)
    app.run(host="0.0.0.0", port=5000, debug=True)