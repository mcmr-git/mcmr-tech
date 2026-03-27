'use client'

import dynamic from 'next/dynamic'
import styles from './page.module.css'

const ParticleMorph = dynamic(() => import('./components/ParticleMorph'), {
  ssr: false,
})

export default function Page() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-label="Morphic particle animation">
        <ParticleMorph />
      </section>

      <section className={styles.content}>
        <div className={styles.intro}>
          <h1 className={styles.name}>Michele Mauri</h1>
          <p className={styles.sectionTitle}>Technical Expertise</p>
        </div>

        <div className={styles.block}>
          <p className={styles.sectionLabel}>What I do:</p>
          <ul className={styles.list}>
            <li>Product strategy and roadmap development</li>
            <li>Technical architecture and stack decisions</li>
            <li>Engineering team building and leadership</li>
            <li>Product development lifecycle oversight</li>
            <li>Go-to-market technical planning</li>
            <li>Fractional CTO/COO advisory for early-stage startups</li>
          </ul>
        </div>

        <div className={styles.block}>
          <p className={styles.sectionLabel}>Who I work with:</p>
          <ul className={styles.list}>
            <li>Venture-backed startups (Seed to Series B)</li>
            <li>Founding teams building their first technical org</li>
            <li>Companies navigating critical scaling decisions</li>
          </ul>
        </div>
      </section>
    </main>
  )
}
