from dotenv import load_dotenv
load_dotenv()
import os

print("=" * 50)
print("KEY:", repr(os.environ.get("GEMINI_API_KEY")))
print("MODEL:", repr(os.environ.get("GEMINI_MODEL")))
print("=" * 50)

from google import genai

try:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    resp = client.models.generate_content(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        contents="say hi"
    )
    print("SUCCESS! Gemini replied:", resp.text)
except Exception as e:
    print("FAILURE TYPE:", type(e).__name__)
    print("FAILURE MESSAGE:", e)

print("=" * 50)
print("Test finished.")