export function OpenBotApp() {
  return (
    <main className="workspace-shell">
      <aside className="rail">
        <div className="brand">
          <span>✣</span>
          <strong>OpenBot</strong>
        </div>
        <button className="new-chat" disabled>
          <span>+</span> New chat
        </button>
        <nav>
          <p>Agents</p>
          <div className="pane-empty">
            <p>Agent navigation will be defined from the UX contract.</p>
          </div>
        </nav>
        <div className="rail-footer">
          <span className="status-dot" /> Server ready
        </div>
      </aside>

      <section className="chat-pane">
        <header>
          <div>
            <p className="eyebrow">Agent workspace</p>
            <h2>OpenBot</h2>
          </div>
        </header>
        <div className="conversation">
          <div className="empty-chat">
            <div className="openbot-glyph">✣</div>
            <h1>What should OpenBot become?</h1>
            <p>The UX and control API will be designed here before provider wiring is added.</p>
          </div>
        </div>
        <div className="composer">
          <textarea disabled placeholder="Chat is not connected yet." />
          <div>
            <span>Control API pending</span>
            <button aria-label="Send" disabled>
              ↑
            </button>
          </div>
        </div>
      </section>

      <section className="work-pane">
        <header className="tabs">
          <button className="active">Preview</button>
        </header>
        <div className="workspace-content">
          <div className="desktop-empty">
            <div className="desktop-frame">
              <div className="browser-chrome">
                <i />
                <i />
                <i />
              </div>
              <div className="desktop-wallpaper">✣</div>
            </div>
            <h3>Workspace preview</h3>
            <p>This surface is intentionally disconnected while its UX is defined.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
