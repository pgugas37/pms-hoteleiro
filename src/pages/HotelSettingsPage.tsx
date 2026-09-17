import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { formatCep, formatCnpj } from '@/lib/format'
import { fetchHotel } from '@/lib/hotel'
import { supabase } from '@/lib/supabase'
import { hotelSchema, type HotelInput } from '@/lib/validations'
import { BRAZIL_STATES, BRAZIL_TIMEZONES } from '@/types/hotel'

export function HotelSettingsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()

  const { data: hotel, isLoading } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<HotelInput>({
    resolver: zodResolver(hotelSchema),
    defaultValues: {
      name: '',
      cnpj: '',
      timezone: 'America/Sao_Paulo',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: 'CE',
      zip: '',
    },
  })

  React.useEffect(() => {
    if (hotel) {
      reset({
        name: hotel.name,
        cnpj: hotel.cnpj ?? '',
        timezone: hotel.timezone,
        street: hotel.address?.street ?? '',
        number: hotel.address?.number ?? '',
        neighborhood: hotel.address?.neighborhood ?? '',
        city: hotel.address?.city ?? '',
        state: (hotel.address?.state as HotelInput['state']) ?? 'CE',
        zip: hotel.address?.zip ?? '',
      })
    }
  }, [hotel, reset])

  const saveHotel = useMutation({
    mutationFn: async (values: HotelInput) => {
      const payload = {
        name: values.name,
        cnpj: values.cnpj,
        timezone: values.timezone,
        address: {
          street: values.street,
          number: values.number,
          neighborhood: values.neighborhood,
          city: values.city,
          state: values.state,
          zip: values.zip,
        },
      }

      const { error } = hotel
        ? await supabase.from('hotels').update(payload).eq('id', hotel.id)
        : await supabase.from('hotels').insert(payload)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] })
      toast.success(hotel ? 'Dados do hotel atualizados.' : 'Hotel cadastrado com sucesso.')
    },
    onError: () => toast.error('Não foi possível salvar os dados do hotel.'),
  })

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do hotel</h1>
        <p className="text-sm text-muted-foreground">
          {hotel
            ? 'Dados cadastrais do hotel.'
            : 'Nenhum hotel cadastrado ainda. Preencha os dados abaixo para o primeiro cadastro.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados gerais</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Somente administradores podem editar essas informações.'
              : 'Você pode visualizar, mas não editar, essas informações.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => saveHotel.mutate(values))}
            className="space-y-4"
          >
            <fieldset disabled={!isAdmin} className="space-y-4 disabled:opacity-70">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do hotel</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={watch('cnpj')}
                  onChange={(e) => setValue('cnpj', formatCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                />
                {errors.cnpj && <p className="text-sm text-destructive">{errors.cnpj.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Fuso horário</Label>
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAZIL_TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="street">Rua</Label>
                  <Input id="street" {...register('street')} />
                  {errors.street && (
                    <p className="text-sm text-destructive">{errors.street.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input id="number" {...register('number')} />
                  {errors.number && (
                    <p className="text-sm text-destructive">{errors.number.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" {...register('neighborhood')} />
                {errors.neighborhood && (
                  <p className="text-sm text-destructive">{errors.neighborhood.message}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" {...register('city')} />
                  {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Controller
                    control={control}
                    name="state"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAZIL_STATES.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">CEP</Label>
                <Input
                  id="zip"
                  value={watch('zip')}
                  onChange={(e) => setValue('zip', formatCep(e.target.value))}
                  placeholder="00000-000"
                />
                {errors.zip && <p className="text-sm text-destructive">{errors.zip.message}</p>}
              </div>

              {isAdmin && (
                <Button type="submit" disabled={saveHotel.isPending}>
                  {saveHotel.isPending ? 'Salvando...' : hotel ? 'Salvar alterações' : 'Cadastrar hotel'}
                </Button>
              )}
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
