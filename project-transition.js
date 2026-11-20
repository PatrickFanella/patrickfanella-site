(() => {
  // Name only the selected project. Naming every list item would capture unrelated headings too.
  // NavigationActivation supplies the source/destination for forward, back and keyboard navigation.
  function selectProject(path) {
    for (const el of document.querySelectorAll('[data-project-name]')) {
      el.style.viewTransitionName = path === `/projects/${el.dataset.projectName}/` ? 'project-name' : ''
    }
  }
  const path = (url) => new URL(url).pathname.replace(/\/?$/, '/')
  function settle(transition) {
    // A skipped/aborted navigation rejects ready even when finished resolves.
    void transition.ready.catch(() => {})
    const cleanup = () => selectProject('')
    void transition.finished.then(cleanup, cleanup)
  }
  addEventListener('pageswap', event => {
    if (!event.viewTransition || !event.activation) return
    const destination = path(event.activation.entry.url)
    selectProject(destination === '/projects/' ? path(location.href) : destination)
    settle(event.viewTransition)
  })
  addEventListener('pagereveal', event => {
    if (!event.viewTransition) return
    const nav = window.navigation
    const from = nav?.activation?.from?.url
    selectProject(location.pathname.startsWith('/projects/') && location.pathname !== '/projects/'
      ? path(location.href) : from ? path(from) : '')
    settle(event.viewTransition)
  })

})()
