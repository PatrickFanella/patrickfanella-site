// Name only the selected project. Naming every list item would capture unrelated headings too.
// NavigationActivation supplies the source/destination for forward, back and keyboard navigation.
function selectProject(path: string) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-project-name]')) {
    el.style.viewTransitionName = path === `/projects/${el.dataset.projectName}/` ? 'project-name' : ''
  }
}
const path = (url: string) => new URL(url).pathname.replace(/\/?$/, '/')
addEventListener('pageswap', ((event: PageSwapEvent) => {
  if (event.viewTransition && event.activation) selectProject(path(event.activation.entry.url!))
}) as EventListener)
addEventListener('pagereveal', ((event: PageRevealEvent) => {
  if (!event.viewTransition) return
  const nav = (window as Window & { navigation?: { activation?: { from?: { url: string | null } } } }).navigation
  const from = nav?.activation?.from?.url
  selectProject(location.pathname.startsWith('/projects/') && location.pathname !== '/projects/'
    ? path(location.href) : from ? path(from) : '')
  void event.viewTransition.finished.finally(() => selectProject(''))
}) as EventListener)
