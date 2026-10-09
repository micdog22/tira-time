# Tira Time — sorteio de times equilibrados para a pelada (HTML + CSS + JS)

Todo racha tem o mesmo drama: tirar os times sem deixar todos os bons do mesmo lado. O Tira Time sorteia times equilibrados a partir de um nível de 1 a 5 para cada jogador, separa os goleiros e gera a lista pronta para colar no grupo do WhatsApp. O elenco fica salvo no navegador, então na semana seguinte é só marcar quem vai jogar.

**Acesse online:** https://micdog22.github.io/tira-time/

## Recursos

- Elenco salvo no navegador, com nível opcional (1 a 5 estrelas), marcação de goleiro e "joga hoje".
- Colar a lista do grupo: um por linha, com nível (`Nome - 4`, `Nome (4)` ou ⭐⭐⭐⭐) e goleiro (`(G)`, `goleiro` ou 🧤). Numeração como `1.` ou `2)` é ignorada e repetidos entram uma vez só.
- Divisão por **número de times** ou por **jogadores por time**, com prévia do que vai acontecer (ex.: "13 jogadores → 2 times de 6 + 1 reserva").
- Opções: equilibrar pelo nível, separar os goleiros (um por time quando der) e deixar reservas quando a divisão não for exata.
- Os tamanhos dos times nunca diferem em mais de 1 jogador.
- Cartões coloridos por time (nomes editáveis), com nível total e média, e lista de reservas.
- **Copiar times** em formato próprio para o WhatsApp, com ou sem os níveis.

## Como usar

1. Cadastre os jogadores um a um ou cole a lista do grupo em **Colar a lista do grupo**. Exemplo:

   ```text
   1. Pedro Exemplo - 4
   2. João Exemplo (G)
   3. Ana Exemplo ⭐⭐⭐
   4. Caio Exemplo goleiro - 2
   ```

2. Desmarque quem não vai jogar hoje.
3. Escolha como dividir (número de times ou jogadores por time) e as opções.
4. Clique em **Sortear times**. Não gostou? **Sortear de novo**.
5. Ajuste os nomes dos times se quiser (ex.: "Coletes") e use **Copiar times** para mandar no grupo.

## Como funciona

1. **Plano.** Sem reservas, todo mundo joga e os times têm tamanhos que diferem em no máximo 1. Com reservas, todos os times ficam do mesmo tamanho e quem sobra fica de fora. No modo "jogadores por time" o número de times é o de times completos que dá para formar.
2. **Goleiros primeiro.** Com a opção ligada, até um goleiro por time é escalado no gol (sorteado entre os goleiros). Goleiros a mais jogam na linha.
3. **Reservas** são sorteadas entre os jogadores de linha.
4. **Cobrinha.** Os jogadores são embaralhados, ordenados por nível (empates ficam na ordem sorteada) e escolhidos em "cobrinha" (1, 2, 3, 3, 2, 1…), começando pelo time mais fraco depois dos goleiros.
5. **Ajuste fino.** Depois, a página testa trocas entre times (goleiro só troca com goleiro) e, quando os tamanhos são diferentes, passar alguém do time maior para o menor. Toda mudança que diminui a diferença entre o time mais forte e o mais fraco é aplicada, até não haver mais melhora.

Quem está sem nível conta como 3. Toda a aleatoriedade usa `crypto.getRandomValues`. Nos testes, com centenas de elencos aleatórios, a diferença entre o time mais forte e o mais fraco nunca passa de 5 pontos (o nível máximo de um jogador).

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com um servidor estático:

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`, com Node 20 ou mais novo). Os testes cobrem leitura da lista colada, regras de tamanho, reservas, distribuição de goleiros, qualidade do equilíbrio, determinismo com gerador injetado e o texto para o WhatsApp.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT — veja [LICENSE](LICENSE).
