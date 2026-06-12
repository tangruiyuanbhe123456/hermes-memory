// test/test-similarity.js — textSimilarity 单元测试
// 复制 dream.cjs 的函数实现,因为它不通过 module.exports 暴露
const path = require("path");
const fs = require("fs");

// 从 dream.cjs 源码动态读取 textSimilarity 函数
// (避免实现分叉)
const dreamSrc = fs.readFileSync(path.join(__dirname, "..", "engine", "dream.cjs"), "utf8");

// 提取 textSimilarity 函数体
const match = dreamSrc.match(/function textSimilarity\([\s\S]*?\n\}/);
if (!match) {
  console.error("FAIL: 无法从 dream.cjs 提取 textSimilarity 函数");
  process.exit(1);
}
// eval 函数定义到当前 scope
eval(match[0]);

// 测试用例
const cases = [
  // [a, b, min/max/expected, description]
  ["我的持仓是京东方A 200股", "持仓包括京东方", "min:0.2", "中文长句应>0.2"],
  ["持仓", "我的持仓", "min:0.4", "短中文应有>0.4 召回"],
  ["foo bar", "foo bar baz", "min:0.3", "英文应>0.3"],
  ["", "anything", "eq:0", "空串返回 0"],
  ["完全不同", "另一个话题", "max:0.2", "完全不同的中文应<0.2"],
  ["持仓NVDA 200股", "持仓NVDA 200股", "eq:1", "完全相同返回 1"],
  ["abc", "xyz", "max:0.1", "完全不同英文应<0.1"],
];

let pass = 0, fail = 0;
for (const [a, b, cond, desc] of cases) {
  const got = textSimilarity(a, b);
  let ok = false;
  let expected = cond;
  if (cond.startsWith("min:")) expected = `>= ${parseFloat(cond.slice(4))}`;
  else if (cond.startsWith("max:")) expected = `<= ${parseFloat(cond.slice(4))}`;
  else if (cond.startsWith("eq:")) expected = `=== ${parseFloat(cond.slice(3))}`;

  if (cond.startsWith("min:")) ok = got >= parseFloat(cond.slice(4));
  else if (cond.startsWith("max:")) ok = got <= parseFloat(cond.slice(4));
  else if (cond.startsWith("eq:")) ok = got === parseFloat(cond.slice(3));

  console.log(`${ok ? "PASS" : "FAIL"} sim("${a}", "${b}") = ${got.toFixed(3)} ${expected} | ${desc}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
