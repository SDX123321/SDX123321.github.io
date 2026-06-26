import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXAM_DIR = join(ROOT, '..', '考试安排');

// ─── File paths ───
const FILE1 = join(EXAM_DIR, '2025-2026学年第二学期考试安排表（学校组织17-18周）-学生用表 (1).xlsx');
const FILE2 = join(EXAM_DIR, '25-26-2学院安排考试安排表 (1).xlsx');
const OUT = join(ROOT, 'files', 'exam-schedule.json');

// ─── Time parsers ───
function parseTime1(raw) {
  // Format: "2026年07月01日(13:30-15:20)"
  const m = String(raw).match(/(\d{4})年(\d{2})月(\d{2})日\((\d{2}:\d{2})-(\d{2}:\d{2})\)/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, start: m[4], end: m[5], iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}` };
}

function parseTime2(raw) {
  // Format: "第17周周5(2026-06-26) 13:30-15:20"
  const m = String(raw).match(/第(\d+)周周(\d+)\((\d{4}-\d{2}-\d{2})\)\s*(\d{2}:\d{2})-(\d{2}:\d{2})/);
  if (!m) return null;
  return { week: +m[1], day: +m[2], date: m[3], start: m[4], end: m[5], iso: `${m[3]}T${m[4]}` };
}

// ─── Parse File 1 (school-organized) ───
function parseFile1(path) {
  const wb = XLSX.readFile(path);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const exams = [];
  for (const r of rows) {
    const cls = String(r['班级名称'] || '').trim();
    const timeRaw = String(r['考试时间'] || '').trim();
    if (!cls || !timeRaw) continue;
    const t = parseTime1(timeRaw);
    if (!t) continue;
    exams.push({
      classId: cls,
      course: String(r['课程名称'] || '').trim(),
      date: t.date,
      start: t.start,
      end: t.end,
      iso: t.iso,
      room: String(r['教室名称'] || '').trim(),
      teacher: String(r['任课教师'] || '').trim(),
      campus: String(r['校区'] || '').trim(),
      college: String(r['学生所在学院'] || '').trim(),
      major: String(r['专业名称'] || '').trim(),
      type: 'school'
    });
  }
  return exams;
}

// ─── Parse File 2 (college-organized) ───
function parseFile2(path) {
  const wb = XLSX.readFile(path);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const exams = [];
  for (const r of rows) {
    // Column H "考试班级" may contain comma-separated class IDs
    const classesRaw = String(r['考试班级'] || r[Object.keys(r).find(k => String(k).includes('班级'))] || '').trim();
    const timeRaw = String(r['考试时间'] || r[Object.keys(r).find(k => String(k).includes('时间'))] || '').trim();
    if (!classesRaw || !timeRaw) continue;
    const t = parseTime2(timeRaw);
    if (!t) continue;
    const classes = classesRaw.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
    for (const cls of classes) {
      exams.push({
        classId: cls,
        course: String(r['课程名称'] || r[Object.keys(r).find(k => String(k).includes('课程'))] || '').trim(),
        date: t.date,
        start: t.start,
        end: t.end,
        iso: t.iso,
        room: String(r['地点'] || r[Object.keys(r).find(k => String(k).includes('地点'))] || '').trim(),
        teacher: String(r['任课教师'] || r[Object.keys(r).find(k => String(k).includes('教师'))] || '').trim(),
        campus: String(r['校区'] || '').trim(),
        college: String(r['开课学院'] || '').trim(),
        major: '',
        type: 'college'
      });
    }
  }
  return exams;
}

// ─── Build index ───
console.log('Parsing File 1 (school-organized)...');
const file1Exams = parseFile1(FILE1);
console.log(`  → ${file1Exams.length} exam entries from ${FILE1.split(/[/\\]/).pop()}`);

console.log('Parsing File 2 (college-organized)...');
const file2Exams = parseFile2(FILE2);
console.log(`  → ${file2Exams.length} exam entries from ${FILE2.split(/[/\\]/).pop()}`);

const allExams = [...file1Exams, ...file2Exams];
const index = {};
for (const e of allExams) {
  if (!index[e.classId]) index[e.classId] = [];
  index[e.classId].push(e);
}

// Sort each class's exams by date
for (const cls of Object.keys(index)) {
  index[cls].sort((a, b) => a.iso.localeCompare(b.iso));
}

// Ensure output dir exists
const outDir = dirname(OUT);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

writeFileSync(OUT, JSON.stringify(index, null, 2), 'utf-8');
const classCount = Object.keys(index).length;
console.log(`\nDone! ${classCount} classes, ${allExams.length} total exam entries → ${OUT}`);
