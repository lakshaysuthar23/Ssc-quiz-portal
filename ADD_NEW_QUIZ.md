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

For new quizzes, add `level` to every question. Use only `easy`, `moderate`, or `pro`. A good mix is about 30% easy, 50% moderate, and 20% pro. Old quizzes without `level` still work, and Practice Pro will simply use all questions.

Use `ansText` as the full correct answer text, not `A`, `B`, `C`, or `D`. It must exactly match one option inside `opts`.

Do not worry if Gemini keeps many correct answers in the same option position. The app shuffles options during tests, and downloaded PDFs also shuffle options with a matching answer key.

If a question needs a diagram later, the app supports optional image fields:

```json
{"q":"Question with diagram?","tag":"Reasoning","level":"moderate","image":"assets/quiz-images/example.png","imageAlt":"Short diagram description","opts":["A","B","C","D"],"ansText":"A","why":"Short explanation."}
```

After GitHub saves the JSON file, the workflow updates `data/quiz-manifest.json`. The homepage then shows the quiz automatically, and the quiz opens through `quiz.html?id=your-file-name`.

For Gemini, use the ready prompt in `GEMINI_QUIZ_PROMPT.md`.
