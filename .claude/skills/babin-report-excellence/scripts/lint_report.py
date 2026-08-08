#!/usr/bin/env python3
"""Deterministic lint for a rendered Babin report (HTML).

Flags the P0/P1 issues a human shouldn't have to eyeball:
  - paragraphs longer than ~5 lines (~90 words)
  - nested cards (a .card inside a .card / .kpi inside .kpi)
  - KPI cards missing a delta or a timeframe
  - raw hex colors not in the approved token set (inline style/hex)
  - numerals sitting in prose that aren't wrapped for the mono face

Usage: python lint_report.py report.html
Exit 1 if any P0/P1 findings.
Pure standard library (html.parser + re) — no dependencies.
"""
import re, sys
from html.parser import HTMLParser

# CORRECTED 8 Aug 2026 — the retired 9-colour hues (#2fd4c4 teal, #8b5cf6 violet,
# #ff9f43 orange, #f5c518 yellow) were whitelisted here, so this lint would have
# passed output using banned colours. Reports must emit CSS variables, not hexes;
# the only literals still tolerated are pure black/white for print.
APPROVED_HEX = {
    "#ffffff", "#fff", "#000000", "#000",
}
WORDS_MAX = 90  # ~5 lines

class Lint(HTMLParser):
    def __init__(self):
        super().__init__()
        self.findings = []
        self.card_depth = 0
        self.open_cards = []   # per-open-tag: did it open a card?
        self.kpi_stack = []      # collect text per open kpi
        self.in_p = False
        self.p_text = ""

    def _classes(self, attrs):
        d = dict(attrs)
        return set((d.get("class") or "").split())

    def handle_starttag(self, tag, attrs):
        cls = self._classes(attrs)
        is_card = "card" in cls or "kpi" in cls   # exact class tokens only
        if is_card:
            if self.card_depth >= 1:
                self.findings.append(("P1", "Nested card/kpi — flatten it (no cards inside cards)."))
            self.card_depth += 1
        self.open_cards.append(is_card)
        if "kpi" in cls:
            self.kpi_stack.append("")
        if tag == "p":
            self.in_p = True
            self.p_text = ""
        # raw hex in inline styles
        style = dict(attrs).get("style", "")
        for hx in re.findall(r"#[0-9a-fA-F]{6}", style):
            if hx.lower() not in APPROVED_HEX:
                self.findings.append(("P0", f"Non-token hex {hx} in inline style — use a semantic token."))

    def handle_endtag(self, tag):
        if self.open_cards:
            if self.open_cards.pop():
                self.card_depth = max(0, self.card_depth - 1)
        if tag == "p" and self.in_p:
            wc = len(self.p_text.split())
            if wc > WORDS_MAX:
                self.findings.append(("P1", f"Paragraph ~{wc} words (>~5 lines) — split or make a list/card."))
            self.in_p = False

    def handle_data(self, data):
        if self.in_p:
            self.p_text += " " + data
        if self.kpi_stack:
            self.kpi_stack[-1] += " " + data

def check_kpis(html):
    findings = []
    # grab each kpi block's inner text
    KPI_CLS = r'class="(?:[^"]*\s)?kpi(?:\s[^"]*)?"'
    for block in re.findall(KPI_CLS + r'.*?(?=' + KPI_CLS + r'|\Z)', html, re.S):
        text = re.sub(r"<[^>]+>", " ", block)
        has_delta = bool(re.search(r"[▲▼↑↓]|[-+]?\d+(\.\d+)?\s*%", text))
        has_time = bool(re.search(r"\b(MoM|YoY|WoW|QoQ|vs|updated|today|week|month|quarter|Q[1-4])\b", text, re.I))
        if not has_delta:
            findings.append(("P1", "KPI card missing a delta (arrow or %change)."))
        if not has_time:
            findings.append(("P1", "KPI card missing a timeframe/benchmark line."))
    return findings

def check_prose_numbers(html):
    # numbers in <p> not wrapped in a mono span/code
    findings = []
    for p in re.findall(r"<p\b[^>]*>(.*?)</p>", html, re.S):
        stripped = re.sub(r"<code>.*?</code>", "", p, flags=re.S)
        stripped = re.sub(r"<span[^>]*\bmono\b[^>]*>.*?</span>", "", stripped, flags=re.S)
        stripped = re.sub(r"<[^>]+>", "", stripped)
        # a "comparable figure": currency/percent/long number
        if re.search(r"(NPR|Rs\.?)\s?\d|₹\d|\d{4,}|\d+\s?%", stripped):
            findings.append(("P2", "Figure in prose not set in mono — wrap money/IDs/% in the mono face."))
            break
    return findings

def main(path):
    html = open(path, encoding="utf-8").read()
    lint = Lint(); lint.feed(html)
    findings = lint.findings + check_kpis(html) + check_prose_numbers(html)
    # dedupe
    seen, out = set(), []
    for sev, msg in findings:
        if (sev, msg) not in seen:
            seen.add((sev, msg)); out.append((sev, msg))
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    out.sort(key=lambda x: order.get(x[0], 9))
    if not out:
        print("No lint findings — clean.")
        return 0
    print(f"{len(out)} finding(s):")
    for sev, msg in out:
        print(f"  [{sev}] {msg}")
    blocking = any(s in ("P0", "P1") for s, _ in out)
    print("\nBLOCKING (P0/P1 present) — fix before render." if blocking else "\nNon-blocking only.")
    return 1 if blocking else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python lint_report.py <report.html>"); sys.exit(2)
    sys.exit(main(sys.argv[1]))
