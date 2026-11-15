import type { Psql } from './psql'

/** Each completed command appends one entry to the live log; user text is always plain text. */
export function startShell(form: HTMLFormElement, psql: Psql) {
  const input = form.querySelector<HTMLInputElement>('input')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const output = document.querySelector<HTMLElement>('[data-shell-output]')!
  const history: string[] = []
  let cursor = 0, draft = ''
  form.hidden = false
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    if (cursor === history.length) draft = input.value
    cursor = Math.max(0, Math.min(history.length, cursor + (event.key === 'ArrowUp' ? -1 : 1)))
    input.value = cursor === history.length ? draft : history[cursor]
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (button.disabled) return
    const command = input.value.trim()
    if (!command) return
    history.push(command); cursor = history.length; draft = ''; input.value = ''
    button.disabled = true; form.setAttribute('aria-busy', 'true')
    const entry = document.createElement('div')
    const prompt = document.createElement('p'); prompt.className = 'shell-command'; prompt.textContent = `$ ${command}`
    entry.append(prompt)
    const say = (text: string) => { const p = document.createElement('p'); p.textContent = text; entry.append(p) }
    const link = (text: string, href: string) => {
      const p = document.createElement('p'), a = document.createElement('a')
      a.href = href; a.textContent = text; p.append(a); entry.append(p)
    }
    const [verb, ...args] = command.split(/\s+/)
    try {
      switch (verb.toLowerCase()) {
        case 'help': say('help · projects · resume · contact · search <words>. Start Clpr live mode in the psql pane to run its Go search handler on eight fixture clips. The SQL benchmark is a separate mode with generated clips.'); break
        case 'projects':
          say('Clpr: Twitch clip search and moderation. HasanAra: searchable broadcast archive. Undertow: browser music-video editor (live beta).')
          link('Browse all projects and delivery statuses', 'https://patrickfanella.co/projects'); break
        case 'resume': say('Senior backend and full-stack engineer. Go, Python, TypeScript and PostgreSQL. Chicago or remote.'); link('Read the résumé and download the PDF', 'https://patrickfanella.co/resume'); break
        case 'contact': link('patrick@subcult.tv', 'mailto:patrick@subcult.tv'); link('GitHub: PatrickFanella', 'https://github.com/PatrickFanella'); link('LinkedIn: Patrick Fanella', 'https://linkedin.com/in/patrick-fanella'); break
        case 'search': {
          if (!args.length) { say('Usage: search <words>, for example search world record.'); break }
          const result = await psql.search(args.join(' '))
          say(`${result.total.toLocaleString('en-US')} matches · ${result.time} ms (${result.timing ?? 'mean query time'}). ${result.top ? `Top hit: ${result.top}` : 'No matching clips.'}`)
          link('Search output in the psql pane', '#p3')
          break
        }
        default: say('Unknown command. Type help for the command list.')
      }
    } catch (err) { say(err instanceof Error ? err.message : 'The search failed. Try again.') }
    // Append once, after completion, so assistive technology announces the whole response.
    output.append(entry)
    button.disabled = false; form.removeAttribute('aria-busy')
  })
}
