import { jsPDF } from 'jspdf'

import { formatCurrency } from '@/lib/format'
import type { Hotel } from '@/types/hotel'
import { PAYMENT_METHOD_LABELS, type PaymentWithReservation } from '@/types/payment'

function formatAddress(hotel: Hotel): string {
  if (!hotel.address) return ''
  const { street, number, neighborhood, city, state } = hotel.address
  const line1 = [street, number].filter(Boolean).join(', ')
  const line2 = [neighborhood, city && state ? `${city}/${state}` : city || state].filter(Boolean).join(' — ')
  return [line1, line2].filter(Boolean).join(' — ')
}

function formatDateBR(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')
}

/** Gera e baixa um recibo em PDF (formato A5) de um pagamento já registrado. */
export function generatePaymentReceiptPdf(payment: PaymentWithReservation, hotel: Hotel | null): void {
  const pageWidth = 148
  const marginX = 15
  const contentWidth = pageWidth - marginX * 2
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(hotel?.name ?? 'Hotel', marginX, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  if (hotel?.cnpj) {
    y += 5.5
    doc.text(`CNPJ: ${hotel.cnpj}`, marginX, y)
  }
  const address = hotel ? formatAddress(hotel) : ''
  if (address) {
    y += 5
    const lines = doc.splitTextToSize(address, contentWidth)
    doc.text(lines, marginX, y)
    y += (lines.length - 1) * 4.5
  }
  doc.setTextColor(0)

  y += 8
  doc.setDrawColor(180)
  doc.line(marginX, y, pageWidth - marginX, y)

  y += 9
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, y, { align: 'center' })

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const receiptNumber = payment.id.slice(0, 8).toUpperCase()
  doc.text(`Recibo nº ${receiptNumber}`, marginX, y)
  doc.text(new Date(payment.created_at).toLocaleString('pt-BR'), pageWidth - marginX, y, { align: 'right' })

  y += 10
  doc.setFontSize(10)
  const guestName = payment.reservations?.guests?.full_name ?? '—'
  doc.text(`Hóspede: ${guestName}`, marginX, y)

  y += 6
  const roomNumber = payment.reservations?.rooms?.number ?? '—'
  const period = payment.reservations
    ? `${formatDateBR(payment.reservations.check_in)} a ${formatDateBR(payment.reservations.check_out)}`
    : '—'
  doc.text(`Quarto: ${roomNumber}    Período: ${period}`, marginX, y)

  y += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(`Valor recebido: ${formatCurrency(Number(payment.amount))}`, marginX, y)

  y += 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Forma de pagamento: ${PAYMENT_METHOD_LABELS[payment.method]}`, marginX, y)

  if (payment.notes) {
    y += 7
    const noteLines = doc.splitTextToSize(`Observações: ${payment.notes}`, contentWidth)
    doc.text(noteLines, marginX, y)
    y += (noteLines.length - 1) * 5
  }

  y += 16
  doc.setDrawColor(180)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  doc.text(`Recibo gerado pelo sistema em ${new Date().toLocaleString('pt-BR')}.`, marginX, y)

  const filenameGuest = guestName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  doc.save(`recibo-${filenameGuest || 'pagamento'}-${receiptNumber}.pdf`)
}
