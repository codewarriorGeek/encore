# Benchmark: with Qloo vs without Qloo

Encore's example cards compared with cards from a Claude model given the same profile and the same card instructions, but no Qloo research (`scripts/make-baselines.mts`). Eight profiles, English cards, memory-book prompts excluded. Run with `scripts/benchmark.mts`.

| | With Qloo (Encore) | Without Qloo |
|---|---|---|
| Prompts traceable to a Qloo result | **100%** (37 of 37) | 0% (no data source) |
| New specific items per card, beyond what the caregiver typed | **1.4** | 0.5 |
| Era and region fit (1 to 5) | **4.9** | 4.9 |

"New specific items" and "era fit" were judged by a Claude model, one card at a time, without being told which version it was. The judge is from the same model family as the card writers, so treat those two rows as indicative rather than definitive. Traceability is measured directly from the data.

## By profile

| Profile | New items with Qloo | New items without Qloo | Era fit with / without |
|---|---|---|---|
| Madinah, 1950s | 1: Al-Ahli Saudi FC | 1: Prophet's Mosque | 4 / 5 |
| Cairo, 1950s | 2: Khan el-Khalili, Orman Garden | 0: none | 5 / 5 |
| Istanbul, 1950s | 1: baklava | 1: Memed, My Hawk | 5 / 4 |
| Kuala Lumpur, 1950s | 3: teh tarik, roti canai, mamak stall | 0: none | 5 / 5 |
| Bandar Seri Begawan, 1960s | 1: Omar Ali Saifuddien Mosque (the gold-domed mosque on the lagoon) | 2: chandas (bamboo chopsticks for ambuyat), Brunei River | 5 / 5 |
| Chicago, 1950s | 1: Wrigley Field | 0: none | 5 / 5 |
| Manchester, 1950s | 0: none | 0: none | 5 / 5 |
| Toronto, 1950s | 2: Little Women, Maple Leaf Gardens | 0: none | 5 / 5 |
