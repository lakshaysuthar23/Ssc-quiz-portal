import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const rootDir = process.cwd();
const quizDir = path.join(rootDir, "data", "quizzes");
const manifestPath = path.join(rootDir, "data", "quiz-manifest.json");

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleFromSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function readJsonIfExists(filePath) {
  try {
    return parseQuizText(await fs.readFile(filePath, "utf8")).data;
  } catch {
    return null;
  }
}

function parseQuizText(text) {
  try {
    return { data: JSON.parse(text), normalized: false };
  } catch (jsonError) {
    try {
      return { data: vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 }), normalized: true };
    } catch {
      throw jsonError;
    }
  }
}

const previousManifest = await readJsonIfExists(manifestPath);
const previousById = new Map((previousManifest?.quizzes || []).map(quiz => [quiz.id, quiz]));
const today = new Date().toISOString().slice(0, 10);

const files = (await fs.readdir(quizDir))
  .filter(file => file.endsWith(".json") && !file.startsWith("_"))
  .sort((a, b) => a.localeCompare(b));

const quizzes = [];

for (const file of files) {
  const filePath = path.join(quizDir, file);
  let quiz;

  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = parseQuizText(text);
    quiz = parsed.data;
    if (parsed.normalized) await fs.writeFile(filePath, `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error(`Could not read ${file}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  const fileId = path.basename(file, ".json");
  const id = slugify(quiz.id || fileId) || fileId;
  const previous = previousById.get(id);
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const declaredCount = Number(quiz.questionCount);
  const questionCount = questions.length > 0
    ? questions.length
    : Number.isFinite(declaredCount) ? declaredCount : 0;

  quizzes.push({
    id,
    title: quiz.title || titleFromSlug(id),
    subject: quiz.subject || "General",
    subjectKey: slugify(quiz.subjectKey || quiz.subject || "general"),
    emoji: quiz.emoji || "",
    published: quiz.published || previous?.published || today,
    questionCount,
    file: `data/quizzes/${file}`
  });
}

quizzes.sort((a, b) => {
  const dateDiff = String(b.published).localeCompare(String(a.published));
  return dateDiff || a.title.localeCompare(b.title);
});

const manifest = { quizzes };

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${quizzes.length} quizzes to data/quiz-manifest.json`);
