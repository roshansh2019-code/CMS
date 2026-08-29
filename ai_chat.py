"""
ai_chat.py
POST /ai/chat — read-only AI assistant for the logged-in student.
Updated to use the `gemini-3.7-flash` model.
"""

import os
import traceback
from flask import Blueprint, request, jsonify
from google import genai
from google.genai import types

from ai_data import build_student_context
from db import get_db

ai_chat_bp = Blueprint("ai_chat_bp", __name__)

_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
# Updated to the required gemini-3.7-flash model identifier
_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")


def _verify_student(roll):
    db = get_db()
    if db is None:
        return False
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT id FROM users WHERE roll=%s AND role='student' AND is_verified=1",
            (roll,)
        )
        return cursor.fetchone() is not None
    finally:
        try:
            cursor.close()
            db.close()
        except Exception:
            pass


def _build_system_prompt(ctx):
    p = ctx["profile"]
    terms_text = "\n".join(
        f"  - {t['exam_term']} (Semester {t['semester']}): GPA {t['gpa']}"
        + (" [one or more subjects failed]" if t["failed_any_subject"] else "")
        for t in ctx["terms"]
    ) or "  (no verified results recorded yet)"

    subj_text = "\n".join(
        f"  - {name}: avg {avg}" for name, avg in ctx["subject_averages"].items()
    ) or "  (no subject data)"

    notices_text = "\n".join(
        f"  - {n['title']}: {n['message']}" for n in ctx["notices"]
    ) or "  (no recent notices)"

    ml_text = f"\nML performance prediction: {ctx['ml_prediction']}" if ctx["ml_prediction"] else ""

    return f"""You are a helpful, encouraging academic assistant inside a college
management system, speaking ONLY to the student described below.

STUDENT (do not discuss any other student, ever):
Name: {p['name']}
Roll: {p['roll']}
Department: {p['department']}
Semester/Year: {p['semester']}

VERIFIED ACADEMIC DATA (these numbers are already computed by the
backend from the database — treat them as ground truth, never invent
or recalculate different numbers):

CGPA: {ctx['cgpa']}
Per-term GPA:
{terms_text}

Subject averages:
{subj_text}

Weakest subject: {ctx['weakest_subject']}
Strongest subject: {ctx['strongest_subject']}

Attendance: {ctx['attendance']['present']} present / {ctx['attendance']['absent']} absent
Attendance percentage: {ctx['attendance']['percentage']}%

Fees: total Rs.{ctx['fees']['total_fee']}, paid Rs.{ctx['fees']['total_paid']}, due Rs.{ctx['fees']['due_amount']}

Recent notices:
{notices_text}
{ml_text}

RULES:
- Only use the numbers given above. Never make up a GPA, percentage, or amount.
- Only verified results are included in GPA/CGPA. If asked about a result not listed here, say it may still be pending verification.
- You cannot change, save, or update any record — you can only explain and advise.
- If asked about another student, or for data not listed above, say you can only help with the current student's own information.
- Be warm, concise, and specific. When asked about performance, explain what the numbers mean and give 1-3 concrete, actionable study or attendance recommendations.
- Use Rs. for currency figures, matching the portal's convention.
"""


def _to_gemini_contents(raw_history, current_message):
    contents = []
    for h in raw_history[-6:]:
        role = h.get("role")
        content = h.get("content")
        if not content:
            continue
        if role == "assistant":
            role = "model"
        if role not in ("user", "model"):
            continue
        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=content)])
        )
    
    contents.append(
        types.Content(role="user", parts=[types.Part.from_text(text=current_message)])
    )
    return contents


@ai_chat_bp.route("/ai/chat", methods=["POST"])
def ai_chat():
    try:
        data = request.json or {}
        roll = (data.get("roll") or "").strip()
        message = (data.get("message") or "").strip()
        history = data.get("history") or []

        if not roll or not message:
            return jsonify({"status": "error", "message": "roll and message are required"}), 400

        if not _verify_student(roll):
            return jsonify({"status": "error", "message": "Student not found or not verified"}), 403

        ctx = build_student_context(roll)
        if ctx is None:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        system_prompt = _build_system_prompt(ctx)
        contents = _to_gemini_contents(history, message)

        response = _client.models.generate_content(
            model=_MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
            ),
        )

        reply_text = (response.text or "").strip()
        return jsonify({"status": "success", "reply": reply_text})

    except Exception as e:
        err_msg = str(e)
        print("AI CHAT ERROR:", err_msg)
        print(traceback.format_exc())
        return jsonify({"status": "error", "message": f"AI service error: {err_msg}"}), 502