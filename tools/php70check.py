#!/usr/bin/env python3
"""PHP 7.0 兼容性静态检查。

用法：python3 tools/php70check.py
发现 7.1+ 语法时退出码为 1。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RULES = [
    (re.compile(r"\)\s*:\s*void\b"), "void 返回类型（PHP 7.1+）"),
    (re.compile(r"\)\s*:\s*\?\s*[A-Za-z_\\]"), "可空返回类型 ?T（PHP 7.1+）"),
    (re.compile(r"\?\?="), "空合并赋值 ??=（PHP 7.4+）"),
    (re.compile(r"(?<![\w$])fn\s*\("), "箭头函数 fn()（PHP 7.4+）"),
    (re.compile(r"(?<![\w$])match\s*\("), "match 表达式（PHP 8.0+）"),
    (re.compile(r"\?->"), "nullsafe 运算符（PHP 8.0+）"),
    (re.compile(r"\b(str_contains|str_starts_with|str_ends_with|array_key_first|array_key_last|is_countable)\s*\("),
     "PHP 7.3+/8.0+ 函数"),
    (re.compile(r"catch\s*\([^)]*\|[^)]*\$"), "多类型 catch（PHP 7.1+）"),
    (re.compile(r"(public|private|protected)\s+(\??[A-Za-z_\\][\w\\]*)\s+\$"), "类型化属性（PHP 7.4+）"),
    (re.compile(r"#\[[A-Za-z_\\]"), "Attribute 语法（PHP 8.0+）"),
    (re.compile(r"\[\s*\.\.\.\$"), "数组展开（PHP 7.4+）"),
]


def main():
    problems = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "vendor")]
        for fn in filenames:
            if not fn.endswith(".php"):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT)
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            for no, line in enumerate(lines, 1):
                for rx, desc in RULES:
                    if rx.search(line):
                        problems.append((rel, no, desc, line.strip()[:120]))
    if not problems:
        print("PHP 7.0 兼容性检查通过")
        return 0
    for rel, no, desc, snippet in problems:
        print("%s:%d  %s  | %s" % (rel, no, desc, snippet))
    print("共 %d 处问题" % len(problems))
    return 1


if __name__ == "__main__":
    sys.exit(main())
