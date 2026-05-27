# Gemini Quiz JSON Prompt

Copy this prompt into Gemini when you want a new quiz.

```text
Create an SSC exam quiz JSON file for: [TOPIC NAME].

Return only valid JSON. Do not use markdown. Do not add any explanation outside the JSON.
Generate exactly [NUMBER] questions.

Use this exact top-level shape:
{
  "title": "[Quiz title]",
  "subject": "[Display subject name]",
  "subjectKey": "[stable-subject-key]",
  "emoji": "",
  "questions": [
  ]
}

Important subject and subjectKey rules:
- subject is the display name, for example "History", "Polity", "Economy", "Physics", "Chemistry", or "Static GK & CA".
- subjectKey is the stable code for grouping quizzes on the homepage.
- Use lowercase words with hyphens only for subjectKey.
- Reuse the same subjectKey for the same subject every time.
- Current subjectKey examples: history, polity, economy, physics, chemistry, static.
- If the subject is new, create a simple stable key like geography, reasoning, biology, or computer.

Use this compact one-line question object format for every question:
{"q":"Question text?","tag":"SSC PYQ","level":"moderate","opts":["Option A","Option B","Option C","Option D"],"ansText":"Option A","why":"Short explanation."}

Very important formatting rules:
- Keep every question object on exactly one line.
- Do not pretty-print question objects across many lines.
- Do not use trailing commas.
- Do not put comments inside JSON.
- Do not number questions outside the q text.
- Use double quotes only.

Question quality rules:
- q must be clear, exam-style, and useful for SSC preparation.
- tag should be the exam/source tag, for example "SSC CGL 2023 PYQ", "SSC CHSL PYQ", "SSC CPO PYQ", "RRB Group D PYQ", or "Topic Practice".
- level is required for new quizzes and must be exactly one of: "easy", "moderate", "pro".
- If unsure about level, use "moderate".
- Keep level distribution roughly: 30% easy, 50% moderate, 20% pro.
- opts must contain exactly 4 options.
- ansText must exactly match one of the option strings inside opts.
- ansText must be the full answer text, not "A", "B", "C", or "D".
- why should be short but useful, preferably one sentence.
- Avoid repeated or duplicate questions.

Answer option note:
- It is okay if many correct answers appear as option A in the JSON.
- The quiz app and PDF generator shuffle options automatically and create the correct answer key.
- Still make all four options meaningful and exam-like.

If a question needs a diagram or image, use this same one-line format:
{"q":"Question with diagram?","tag":"Reasoning","level":"moderate","image":"assets/quiz-images/example.png","imageAlt":"Short diagram description","opts":["A","B","C","D"],"ansText":"A","why":"Short explanation."}
```
