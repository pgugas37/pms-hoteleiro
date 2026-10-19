import * as React from 'react'

import simboloUrl from '@/assets/brand/millenium-simbolo.png'
import wordmarkUrl from '@/assets/brand/millenium-wordmark-branco.png'

// Linhas que cortam o círculo, como no símbolo da logo (cordas girando em volta de um arco).
const CHORDS = Array.from({ length: 13 }, (_, i) => {
  const start = ((150 + i * 15) * Math.PI) / 180
  const end = start + (118 * Math.PI) / 180
  return {
    x1: 500 + 490 * Math.cos(start),
    y1: 500 + 490 * Math.sin(start),
    x2: 500 + 490 * Math.cos(end),
    y2: 500 + 490 * Math.sin(end),
  }
})

function BrandPattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} aria-hidden="true">
      <circle cx="500" cy="500" r="490" fill="hsl(var(--mint))" fillOpacity="0.07" />
      <circle
        cx="500"
        cy="500"
        r="490"
        fill="none"
        stroke="hsl(var(--mint))"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {CHORDS.map((c, i) => (
        <line
          key={i}
          {...c}
          stroke="hsl(var(--mint))"
          strokeOpacity="0.3"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

/** Moldura das telas públicas (login, configuração inicial, definir senha). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col overflow-hidden bg-pine p-12 text-white lg:flex">
        <img src={wordmarkUrl} alt="Millenium Hotel" className="relative z-10 h-10 w-auto self-start" />
        <div className="relative z-10 mt-20 max-w-sm">
          <p className="font-display text-[34px] font-semibold leading-[1.15]">
            Reservas, quartos e financeiro do hotel no mesmo painel.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/60">Acesso restrito à equipe do Millenium Hotel.</p>
        </div>
        <BrandPattern className="pointer-events-none absolute -bottom-[38%] -right-[30%] w-[115%]" />
      </aside>

      <main className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-sm">
          <img src={simboloUrl} alt="Millenium Hotel" className="mb-10 h-12 w-12 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  )
}

export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[32px] font-semibold leading-tight">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}
