#!/usr/bin/env python3
"""Verify Babin report tokens meet WCAG AA on both themes.

AA: 4.5:1 for normal text, 3:1 for large text and non-text/UI.
Run: python check_contrast.py
Exit code 1 if any pair fails (so it can gate a build).
"""

def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def luminance(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126*_lin(r) + 0.7152*_lin(g) + 0.0722*_lin(b)

def ratio(fg, bg):
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

# (label, foreground, background, required_ratio)
DARK = {
    "surface-base": "#050B12", "surface-card": "#0B1622",
    "text-primary": "#EAF2FA", "text-secondary": "#AEBACA", "text-muted": "#5A6776",
    "accent": "#2F7DFF", "accent-brand": "#D9A83C",
}
LIGHT = {
    "surface-base": "#FFFFFF", "surface-card": "#FFFFFF", "surface-sunken": "#F4F6F9",
    "text-primary": "#12202E", "text-secondary": "#3A4A5C", "text-muted": "#6B7889",
    "accent": "#1F5FD0", "accent-brand": "#9A7620",
}

def checks(t):
    return [
        ("body text on base",        t["text-primary"],   t["surface-base"], 4.5),
        ("body text on card",        t["text-primary"],   t["surface-card"], 4.5),
        ("secondary text on card",   t["text-secondary"], t["surface-card"], 4.5),
        ("muted (large only) card",  t["text-muted"],     t["surface-card"], 3.0),
        ("accent (UI/large) on base",t["accent"],         t["surface-base"], 3.0),
        ("brand (UI/large) on base", t["accent-brand"],   t["surface-base"], 3.0),
    ]

def run(name, tokens):
    print(f"\n{name} theme")
    ok = True
    for label, fg, bg, req in checks(tokens):
        r = ratio(fg, bg)
        passed = r >= req
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {label:28s} {r:5.2f}:1  (need {req}:1)  {fg} on {bg}")
    return ok

if __name__ == "__main__":
    import sys
    ok = run("DARK (OS)", DARK) & run("LIGHT (export)", LIGHT)
    print("\nAll AA checks passed." if ok else "\nSome checks FAILED — adjust tokens.")
    sys.exit(0 if ok else 1)
