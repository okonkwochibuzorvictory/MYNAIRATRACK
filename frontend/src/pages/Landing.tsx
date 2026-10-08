export default function Landing() {
  return (
    <div className="mt-auth-wrap">
      <div className="mt-hero">
        <div className="mt-hero-card">
          <div className="mt-brand">
            <span className="mt-brand-mark" aria-hidden="true">
              ₦
            </span>
            <span className="mt-brand-name">
              MYNAIRA<span>TRACK</span>
            </span>
          </div>
          <h1>
            Know your money. <span>Grow your money.</span>
          </h1>
          <p className="mt-hero-tag">
            A simple personal finance companion for Nigeria — track income and expenses, plan
            budgets, and work toward your goals in NGN, USD, EUR and GBP.
          </p>
          <div className="mt-hero-actions">
            <a className="mt-btn mt-btn-gold" href="#/signup">
              Get started
            </a>
            <a
              className="mt-btn"
              style={{ background: 'transparent', border: '1px solid #e9c46a', color: '#e9c46a' }}
              href="#/login"
            >
              Log in
            </a>
          </div>
        </div>
        <div className="mt-hero-list">
          <div className="mt-hero-item">
            <h3>◉ One dashboard</h3>
            <p>See income, expenses, budgets and savings in one calm overview.</p>
          </div>
          <div className="mt-hero-item">
            <h3>⇄ True multi-currency</h3>
            <p>Every amount keeps its original currency. Nothing is ever silently converted.</p>
          </div>
          <div className="mt-hero-item">
            <h3>◎ Goals that encourage</h3>
            <p>Set savings targets and watch steady progress over time.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
