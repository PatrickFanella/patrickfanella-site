// Anchor support is optional: preserve the in-flow grid in Firefox, without JS, and on phones.
if (CSS.supports('top', 'anchor(top)')) {
  const rows = [...document.querySelectorAll<HTMLElement>('.excerpt-row[data-note]')]
  const align = () => {
    for (const row of rows) {
      row.classList.remove('anchored'); row.style.minHeight = ''
      if (innerWidth <= 800) continue
      const note = row.querySelector<HTMLElement>('.note')!
      const line = row.querySelector<HTMLElement>('[style*="anchor-name"]')!
      const box = row.getBoundingClientRect(), n = note.getBoundingClientRect()
      row.style.minHeight = `${Math.max(box.height, line.getBoundingClientRect().top - box.top + n.height)}px`
      row.style.setProperty('--note-left', `${n.left - box.left}px`)
      row.style.setProperty('--note-width', `${n.width}px`)
      row.classList.add('anchored')
    }
  }
  void document.fonts.ready.then(align)
  addEventListener('resize', align)
}

// Real fragment links work without scripts; script adds focus and repeats clearance after fonts
// and optional source anchoring settle, including direct hash entry.
function focusNote() {
  const target = document.getElementById(location.hash.slice(1))
  if (!target?.classList.contains('note')) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start' })
}
addEventListener('hashchange', focusNote)
void document.fonts.ready.then(() => requestAnimationFrame(focusNote))
