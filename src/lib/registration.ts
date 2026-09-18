import { jsPDF } from 'jspdf'

import { DOCUMENT_TYPE_LABELS } from '@/types/guest'
import type { Hotel } from '@/types/hotel'
import { nightsBetween, type ReservationWithRelations } from '@/types/reservation'

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

/**
 * Gera e baixa a Ficha de Registro de Hóspede (FNRH) em PDF de uma reserva — documento de
 * identificação do hóspede exigido pela legislação de hospedagem no Brasil.
 */
export function generateGuestRegistrationPdf(reservation: ReservationWithRelations, hotel: Hotel | null): void {
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
  doc.text('FICHA NACIONAL DE REGISTRO DE HÓSPEDE', pageWidth / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(110)
  y += 5.5
  doc.text('(FNRH — nos termos da regulamentação de hospedagem)', pageWidth / 2, y, { align: 'center' })
  doc.setTextColor(0)

  const guest = reservation.guests
  const room = reservation.rooms
  const nights = nightsBetween(reservation.check_in, reservation.check_out)

  function field(label: string, value: string, x: number, fieldY: number, width: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text(label, x, fieldY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    const lines = doc.splitTextToSize(value || '—', width)
    doc.text(lines, x, fieldY + 5)
    return lines.length
  }

  y += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(70)
  doc.text('DADOS DO HÓSPEDE RESPONSÁVEL', marginX, y)
  doc.setTextColor(0)

  y += 8
  field('Nome completo', guest?.full_name ?? '—', marginX, y, contentWidth)

  y += 14
  const halfWidth = contentWidth / 2 - 4
  field(
    'Documento',
    guest?.document_type
      ? `${DOCUMENT_TYPE_LABELS[guest.document_type]}: ${guest.document_number ?? '—'}`
      : '—',
    marginX,
    y,
    halfWidth
  )
  field('Nacionalidade', guest?.nationality ?? '—', marginX + halfWidth + 8, y, halfWidth)

  y += 14
  field('Data de nascimento', guest?.birth_date ? formatDateBR(guest.birth_date) : '—', marginX, y, halfWidth)
  if (reservation.occupant_name) {
    field('Ocupante do quarto (se diferente)', reservation.occupant_name, marginX + halfWidth + 8, y, halfWidth)
  }

  y += 16
  doc.setDrawColor(210)
  doc.line(marginX, y, pageWidth - marginX, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(70)
  doc.text('DADOS DA HOSPEDAGEM', marginX, y)
  doc.setTextColor(0)

  y += 8
  const thirdWidth = contentWidth / 3 - 6
  field('Quarto', room ? `${room.number}${room.room_types?.name ? ` (${room.room_types.name})` : ''}` : '—', marginX, y, thirdWidth)
  field('Check-in', formatDateBR(reservation.check_in), marginX + thirdWidth + 9, y, thirdWidth)
  field('Check-out', formatDateBR(reservation.check_out), marginX + (thirdWidth + 9) * 2, y, thirdWidth)

  y += 14
  field('Nº de noites', String(nights), marginX, y, thirdWidth)
  field('Adultos', String(reservation.adults), marginX + thirdWidth + 9, y, thirdWidth)
  field('Crianças', String(reservation.children), marginX + (thirdWidth + 9) * 2, y, thirdWidth)

  y += 22
  doc.setDrawColor(210)
  doc.line(marginX, y, pageWidth - marginX, y)

  y += 12
  doc.setFontSize(8.5)
  doc.setTextColor(90)
  const declaration = doc.splitTextToSize(
    'Declaro serem verdadeiras as informações prestadas nesta ficha de registro, nos termos da legislação aplicável à atividade de hospedagem.',
    contentWidth
  )
  doc.text(declaration, marginX, y)
  y += declaration.length * 4.5 + 18

  doc.setDrawColor(0)
  doc.line(marginX, y, marginX + 80, y)
  doc.setFontSize(8)
  doc.text('Assinatura do hóspede', marginX, y + 5)

  doc.line(pageWidth - marginX - 60, y, pageWidth - marginX, y)
  doc.text('Data', pageWidth - marginX - 60, y + 5)

  y += 20
  doc.setDrawColor(180)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  doc.text(`Ficha gerada pelo sistema em ${new Date().toLocaleString('pt-BR')}.`, marginX, y)

  const filenameGuest = (guest?.full_name ?? 'hospede')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  doc.save(`ficha-registro-${filenameGuest}-quarto-${room?.number ?? ''}.pdf`)
}
