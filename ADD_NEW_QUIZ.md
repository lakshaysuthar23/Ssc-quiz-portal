# Add A New Quiz

Create one new file in `data/quizzes`.

Example filename:

```text
census-2011-2027.json
```

Use this shape. Keep each question object on one line so Gemini can fit more questions in one response:

```json
{
  "title": "Census 2011 & 2027",
  "subject": "Static GK & CA",
  "subjectKey": "static",
  "emoji": "",
  "questions": [
{"q":"Question text?","tag":"SSC CGL","level":"moderate","opts":["Option A","Option B","Option C","Option D"],"ansText":"Option A","why":"Short explanation."}
  ]
}
```

You do not need to edit `index.html`, create a quiz HTML file, count questions, or set a local storage key.

Use `subject` for the display name and `subjectKey` for the stable code. Keep the same `subjectKey` for future quizzes of that subject, for example `history`, `polity`, `economy`, `physics`, `chemistry`, or `static`.

`level` is optional. Use only `easy`, `moderate`, or `pro`. Old quizzes without `level` still work, and Practice Pro will simply use all questions.

After GitHub saves the JSON file, the workflow updates `data/quiz-manifest.json`. The homepage then shows the quiz automatically, and the quiz opens through `quiz.html?id=your-file-name`.

For Gemini, use the ready prompt in `GEMINI_QUIZ_PROMPT.md`.
