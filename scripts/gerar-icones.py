"""Gera os ícones do app instalável a partir do símbolo do hotel (sólido, sem contorno branco).

Uso: python scripts/gerar-icones.py [caminho do símbolo]
Sem argumento, usa a versão grande em OneDrive\\Documentos\\hotel\\300ppi (se existir) ou a de src/assets/brand.
O símbolo original tem um anel branco em volta do círculo: o script acha o círculo menta pela cor
e recorta um pouco por dentro dele, então o anel nunca aparece.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
GRANDE = Path.home() / 'OneDrive' / 'Documentos' / 'hotel' / '300ppi' / '1Ativo 3.png'
PEQUENO = RAIZ / 'src' / 'assets' / 'brand' / 'millenium-simbolo.png'
PUBLICO = RAIZ / 'public'
PINHO = (0x00, 0x2E, 0x2F, 255)


def eh_menta(r: int, g: int, b: int, a: int) -> bool:
    # Menta da marca: #33CB98 (51, 203, 152)
    return a > 200 and g > 150 and r < 120 and 100 < b < 200


def circulo_menta(origem: Path) -> Image.Image:
    imagem = Image.open(origem).convert('RGBA')
    largura, altura = imagem.size
    pixels = imagem.load()
    xs, ys = [], []
    for y in range(altura):
        for x in range(largura):
            if eh_menta(*pixels[x, y]):
                xs.append(x)
                ys.append(y)
    esquerda, direita, topo, base = min(xs), max(xs), min(ys), max(ys)
    lado = max(direita - esquerda, base - topo) + 1
    cx, cy = (esquerda + direita) / 2, (topo + base) / 2
    recorte = imagem.crop((round(cx - lado / 2), round(cy - lado / 2), round(cx + lado / 2), round(cy + lado / 2)))
    # máscara circular 1,5% para dentro da borda: tira o anel branco e o serrilhado claro
    mascara = Image.new('L', recorte.size, 0)
    margem = lado * 0.015
    ImageDraw.Draw(mascara).ellipse((margem, margem, lado - margem, lado - margem), fill=255)
    recorte.putalpha(mascara)
    return recorte


def icone(simbolo: Image.Image, tamanho: int, fracao: float, destino: str) -> None:
    fundo = Image.new('RGBA', (tamanho, tamanho), PINHO)
    lado = round(tamanho * fracao)
    reduzido = simbolo.resize((lado, lado), Image.LANCZOS)
    posicao = ((tamanho - lado) // 2, (tamanho - lado) // 2)
    fundo.alpha_composite(reduzido, posicao)
    fundo.convert('RGB').save(PUBLICO / destino, optimize=True)
    print(f'{destino}: {tamanho}x{tamanho}')


if __name__ == '__main__':
    origem = Path(sys.argv[1]) if len(sys.argv) > 1 else (GRANDE if GRANDE.exists() else PEQUENO)
    print(f'símbolo: {origem}')
    simbolo = circulo_menta(origem)
    icone(simbolo, 192, 0.78, 'pwa-192.png')
    icone(simbolo, 512, 0.78, 'pwa-512.png')
    icone(simbolo, 512, 0.62, 'pwa-maskable-512.png')  # o Android recorta: o símbolo precisa caber no círculo de 80%
    icone(simbolo, 180, 0.78, 'apple-touch-icon.png')
