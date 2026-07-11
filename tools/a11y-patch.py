#!/usr/bin/env python3
"""Apply shared accessibility + mobile-first fixes across public/*.html.

Idempotent: safe to run repeatedly. Prints a per-file change report.
- Insert skip-to-content link after <body>
- Add id="nav-links" to the nav-links container (aria-controls target)
- Add aria-expanded/aria-controls to the hamburger button
- Replace the legacy hamburger JS with an accessible version
- Inject the accessible hamburger JS on pages that have a hamburger but no JS
- Wrap page content in <main id="main"> where a landmark is missing
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
SKIP_LINK = '<a href="#main" class="skip-link">Skip to content</a>\n'
MAIN_OPEN = '<main id="main">\n'
MAIN_CLOSE = '\n</main>'

# Accessible hamburger JS (closes on link click / Escape; announces aria-expanded)
HAMBURGER_JS = """  // Mobile hamburger — accessible: announces state, closes on link
  // selection / Escape, and restores focus target.
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav-links');
  const navActs   = document.querySelector('.nav-actions');
  function setMenu(open) {
    [navLinks, navActs].forEach(el => {
      if (!el) return;
      el.style.display      = open ? 'flex' : '';
      el.style.flexDirection = 'column';
      el.style.position      = 'absolute';
      el.style.top           = '64px';
      el.style.left          = '0';
      el.style.right         = '0';
      el.style.background    = 'rgba(3,7,18,.98)';
      el.style.padding       = '16px 24px';
      el.style.borderBottom  = '1px solid rgba(255,255,255,.06)';
    });
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  hamburger.addEventListener('click', () => {
    setMenu(hamburger.getAttribute('aria-expanded') !== 'true');
  });
  document.querySelectorAll('.nav-links a, .nav-actions a').forEach(a => {
    a.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hamburger.getAttribute('aria-expanded') === 'true') setMenu(false);
  });"""

# Legacy hamburger JS block to replace (matches the original verbatim)
LEGACY_HAMBURGER = re.compile(
    r"  // Mobile hamburger\n"
    r"  document\.getElementById\('hamburger'\)\.addEventListener\('click', \(\) => \{.*?\n  \}\);",
    re.DOTALL,
)

report = []
for f in sorted(ROOT.glob("*.html")):
    s = f.read_text()
    orig = s
    changes = []

    # 1. skip-link
    if "skip-link" not in s:
        s = re.sub(r"(<body>\s*\n)", r"\1" + SKIP_LINK, s, count=1)
        changes.append("skip-link")

    # 2. id="nav-links" on the nav-links container
    if 'class="nav-links" id="nav-links"' not in s and 'id="nav-links"' not in s:
        s = s.replace('<div class="nav-links">', '<div class="nav-links" id="nav-links">', 1)
        if 'id="nav-links"' in s and s != orig:
            changes.append("nav-links id")
        else:
            # might already differ; try regex
            s2 = re.sub(r'(<div class="nav-links")>', r'\1 id="nav-links">', s, count=1)
            if s2 != s:
                s = s2; changes.append("nav-links id")
    elif 'id="nav-links"' not in s and '<div class="nav-links"' in s:
        s = re.sub(r'(<div class="nav-links")>', r'\1 id="nav-links">', s, count=1)
        changes.append("nav-links id")

    # 3. hamburger button aria attrs
    if 'id="hamburger"' in s and 'aria-expanded' not in s.split('id="hamburger"')[1].split('>')[0]:
        s = re.sub(
            r'(<button class="nav-hamburger" id="hamburger")( aria-label="[^"]*")?(\s*>)',
            r'\1\2 aria-expanded="false" aria-controls="nav-links"\3',
            s, count=1,
        )
        # normalize aria-label to "Open menu"
        s = re.sub(
            r'(<button class="nav-hamburger" id="hamburger") aria-label="[^"]*"',
            r'\1 aria-label="Open menu"',
            s, count=1,
        )
        if 'aria-expanded' in s:
            changes.append("hamburger aria")

    # 4. replace legacy hamburger JS
    if LEGACY_HAMBURGER.search(s):
        s = LEGACY_HAMBURGER.sub(HAMBURGER_JS, s)
        changes.append("hamburger JS replaced")
    elif 'id="hamburger"' in s and "setMenu" not in s:
        # has hamburger button but no accessible JS — inject before </script> that precedes </body>
        inject = "\n<script>\n" + HAMBURGER_JS + "\n</script>\n"
        s = s.replace("</body>", inject + "</body>", 1)
        changes.append("hamburger JS injected")

    # 5. <main> landmark where missing
    if "<main" not in s and '<footer' in s and 'class="nav"' in s:
        # open after </nav>, close before the footer comment / <footer
        if "</nav>" in s:
            s = s.replace("</nav>", "</nav>\n" + MAIN_OPEN, 1)
            # close before <footer (and any preceding comment line)
            s = re.sub(r"(\n</section>)(\s*\n<!--[^>]*Footer[^>]*-->\s*\n<footer)", r"\1\n</main>\2", s, count=1)
            if "</main>" not in s:
                # fallback: close right before <footer
                s = re.sub(r"(\n)(<footer)", r"\1</main>\n\2", s, count=1)
            changes.append("main landmark")

    if s != orig:
        f.write_text(s)
        report.append(f"{f.name}: {' | '.join(changes)}")
    else:
        report.append(f"{f.name}: (no change)")

print("\n".join(report))
