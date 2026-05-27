# Gemini Quiz JSON Prompt

Copy this prompt into Gemini when you want a new quiz.

```text
Create an SSC exam quiz JSON file for: [TOPIC NAME].

Return only valid JSON. Do not use markdown. Do not add explanation outside JSON.

Use this top-level shape:
{
  "title": "[Quiz title]",
  "subject": "[Display subject name]",
  "subjectKey": "[stable-subject-key]",
  "emoji": "[one relevant emoji or empty string]",
  "questions": [
  ]
}

Important subjectKey rules:
- Use lowercase words with hyphens only.
- Reuse the same key for the same subject every time.
- Current examples: history, polity, economy, physics, chemistry, static.
- If the subject is new, create a simple stable key like geography or reasoning.

Question object format:
{"q":"Question text?","tag":"SSC PYQ","level":"moderate","opts":["Option A","Option B","Option C","Option D"],"ansText":"Option A","why":"Short explanation."}

Generate [NUMBER] questions. Keep every question object on exactly one line. This is important because I need many questions in one response.

Rules for questions:
- q must be clear and exam-style.
- tag should be the exam/source tag, for example SSC CGL, SSC CHSL, SSC PYQ, or Topic Practice.
- level must be one of: easy, moderate, pro.
- opts must contain 4 options.
- ansText must exactly match one of the options.
- why should be short but useful.
- Do not use trailing commas.
- Do not number questions outside the q text.

If a question needs a diagram or image, add an image field later like this:
{"q":"Question with diagram?","tag":"Reasoning","level":"moderate","image":"assets/quiz-images/example.png","imageAlt":"Short diagram description","opts":["A","B","C","D"],"ansText":"A","why":"Short explanation."}
```
