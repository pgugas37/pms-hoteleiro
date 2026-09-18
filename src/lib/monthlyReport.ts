import { jsPDF } from 'jspdf'

import { formatCurrency } from '@/lib/format'
import type { Hotel } from '@/types/hotel'
import { RESERVATION_STATUS_LABELS, type ReservationStatus } from '@/types/reservation'

function formatAddress(hotel: Hotel): string {
  if (!hotel.address) return ''
  const { street, number, neighborhood, city, state } = hotel.address
  const line1 = [street, number].filter(Boolean).join(', ')
  const line2 = [neighborhood, city && state ? `${city}/${state}` : city || state].filter(Boolean).join(' — ')
  return [line1, line2].filter(Boolean).join(' — ')
}

export interface MonthlyReportData {
  hotel: Hotel | null
  monthLabel: string
  summary: { faturado: number; recebido: number; pendente: number }
  kpi: { occupancyRate: number; adr: number; revPar: number } | null
  statusCounts: Record<ReservationStatus, number>
  noShowCount: number
  totalReservations: number
  newGuestsCount: number
}

/** Gera e baixa o relatório mensal consolidado em PDF (financeiro, indicadores, reservas por status, hóspedes novos). */
export function generateMonthlyReportPdf(data: MonthlyReportData): void {
  const { hotel, monthLabel, summary, kpi, statusCounts, noShowCount, totalReservations, newGuestsCount } = data
  const pageWidth = 210
  const marginX = 18
  const contentWidth = pageWidth - marginX * 2
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(hotel?.name ?? 'Hotel', marginX, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  if (hotel?.cnpj) {
    y += 6
    doc.text(`CNPJ: ${hotel.cnpj}`, marginX, y)
  }
  const address = hotel ? formatAddress(hotel) : ''
  if (address) {
    y += 5.5
    const lines = doc.splitTextToSize(address, contentWidth)
    doc.text(lines, marginX, y)
    y += (lines.length - 1) * 5
  }
  doc.setTextColor(0)

  y += 9
  doc.setDrawColor(180)
  doc.line(marginX, y, pageWidth - marginX, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('RELATÓRIO MENSAL', pageWidth / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  y += 6
  doc.text(monthLabel, pageWidth / 2, y, { align: 'center' })
  doc.setTextColor(0)

  function sectionTitle(title: string) {
    y += 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(70)
    doc.text(title, marginX, y)
    doc.setTextColor(0)
  }

  function field(label: string, value: string, x: number, fieldY: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text(label, x, fieldY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    doc.text(value, x, fieldY + 5)
  }

  // Financeiro
  sectionTitle('FINANCEIRO (reservas com check-in no mês)')
  y += 8
  const thirdWidth = contentWidth / 3 - 6
  field('Faturado', formatCurrency(summary.faturado), marginX, y)
  field('Recebido', formatCurrency(summary.recebido), marginX + thirdWidth + 9, y)
  field('Pendente', formatCurrency(summary.pendente), marginX + (thirdWidth + 9) * 2, y)

  // Indicadores
  sectionTitle('INDICADORES DE OCUPAÇÃO')
  y += 8
  if (kpi) {
    field('Taxa de ocupação', `${Math.round(kpi.occupancyRate * 100)}%`, marginX, y)
    field('Diária média (ADR)', formatCurrency(kpi.adr), marginX + thirdWidth + 9, y)
    field('RevPAR', formatCurrency(kpi.revPar), marginX + (thirdWidth + 9) * 2, y)
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('Sem quartos cadastrados pra calcular indicadores.', marginX, y)
    doc.setTextColor(0)
  }

  // Reservas por status
  sectionTitle('RESERVAS NO MÊS (por check-in)')
  y += 8
  const statusOrder: ReservationStatus[] = ['confirmada', 'em_andamento', 'finalizada', 'cancelada']
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const status of statusOrder) {
    doc.text(`${RESERVATION_STATUS_LABELS[status]}:`, marginX, y)
    doc.setFont('helvetica', 'bold')
    doc.text(String(statusCounts[status] ?? 0), marginX + 55, y)
    doc.setFont('helvetica', 'normal')
    y += 6
  }
  doc.setTextColor(120)
  doc.setFontSize(8.5)
  doc.text(`Das canceladas, ${noShowCount} foram registradas como no-show.`, marginX, y)
  doc.setTextColor(0)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`Total de reservas com check-in no mês: ${totalReservations}`, marginX, y)

  // Hóspedes
  sectionTitle('HÓSPEDES')
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Novos hóspedes cadastrados no mês: `, marginX, y)
  doc.setFont('helvetica', 'bold')
  doc.text(String(newGuestsCount), marginX + 68, y)

  y += 16
  doc.setDrawColor(180)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  doc.text(`Relatório gerado pelo sistema em ${new Date().toLocaleString('pt-BR')}.`, marginX, y)

  const filenameMonth = monthLabel
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  doc.save(`relatorio-mensal-${filenameMonth}.pdf`)
}
