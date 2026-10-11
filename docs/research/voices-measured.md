# Noesis listening report

Text (349 characters):

> Welcome to the listening test. Did the harbour fund grow by 3.5 percent last year? Ananya Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listen to long documents. Tharun Gundu checked every sentence by ear before the release. The fish arrived fresh at dawn, packed in ice. Thanks.

| voice | WER | misheard | RMS dBFS | clipped | worst join click | gap max ms | gap min ms | flagged joins | pitch dev st | roominess ms | brightness |
|---|---|---|---|---|---|---|---|---|---|---|---|
| en_US-ljspeech-medium | 19.4% | harbour>harbor 3>three 5>five ananya>anya that>at listen>listened gundu>garan checked>gonduchek fish>efficient -tharun -the +and | -25.6 | 0 | 0.15 | 110 | 30 | 1 | 3.88 | 65.0 | 0.07 |
| en_US-kristin-medium | 12.9% | harbour>harbor ananya>annual rao>row listen>listened gundu>thurngundu -percent -tharun +an | -24.7 | 0 | 0.14 | 240 | 180 | 0 | 2.66 | 60.0 | 0.11 |
| en_GB-cori-medium | 16.1% | harbour>harper 3>three 5>five ananya>annual rao>row listen>listened tharun>and gundu>gundy +an +thou | -26.3 | 0 | 0.04 | 290 | 240 | 0 | 2.80 | 45.0 | 0.01 |
| en_GB-alba-medium | 11.3% | room>rim listen>listened gundu>tharn checked>gunduchette thanks>aksa -percent -tharun | -26.9 | 0 | 0.01 | 420 | 210 | 0 | 2.90 | 40.0 | 0.02 |
| en_US-john-medium | 19.4% | harbour>harbor 3>three 5>five ananya>annual rao>row listen>listened tharun>gun gundu>to packed>hacked +an +though +and | -28.5 | 0 | 0.03 | 260 | 190 | 0 | 3.63 | 50.0 | 0.03 |
| en_US-norman-medium | 19.4% | harbour>harbor 3>three 5>five ananya>andrew listen>listened tharun>done gundu>to checked>check at>had dawn>torn +and +thereun | -26.2 | 0 | 0.01 | 320 | 200 | 0 | 3.92 | 50.0 | 0.01 |
| en_US-joe-medium | 14.5% | harbour>harbor ananya>anir listen>listened tharun>gun gundu>knew -percent +and +bar +and | -24.7 | 0 | 0.01 | 280 | 200 | 0 | 5.44 | 40.0 | 0.00 |
| en_US-bryce-medium | 11.3% | harbour>harbor 3>three 5>five listen>listened gundu>tharen checked>gonduchekte -tharun | -24.4 | 0 | 0.21 | 300 | 230 | 0 | 3.71 | 80.0 | 0.08 |
| en_US-mike-medium | 12.9% | harbour>harbor ananya>anya listen>listened gundu>farangundu in>and -percent -tharun +and | -22.7 | 0 | 0.49 | 370 | 210 | 0 | 1.98 | 85.0 | 0.00 |
| en_US-reza_ibrahim-medium | 98.4% | -welcome -to -the -listening -test -did -the -harbour -fund -grow -by -3 -5 -percent -last -year -ananya -rao -who -leads -the -team -wrote -that -the -new -library -the -faster -engine -and -the -quieter -room -all -changed -how -people -listen -to -long -documents -tharun -gundu -checked -every -sentence -by -ear -before -the -release -the -fish -arrived -fresh -at -dawn -packed -in -ice | -24.4 | 0 | 1.28 | 1170 | 70 | 1 | 2.73 | 55.0 | 0.06 |
| en_GB-northern_english_male-medium | 9.7% | ananya>nanya rao>rauk listen>listened gundu>farangundoo -percent -tharun | -22.1 | 0 | 0.07 | 370 | 180 | 0 | 3.10 | 50.0 | 0.02 |

## en_US-ljspeech-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbor fund grow by three? Five percent last year, and Anya Rao, who leads the team, wrote at the new library, the Faster Engine, and the quieter room all changed how people listened to long documents. Garan Gonduchek, every sentence by ear before the release. Efficient arrived fresh at dawn, packed in ice. Thanks.

Stretch: 23.33 s. Silence: lead 0 ms, tail 30 ms, longest internal pause 460 ms.
Pitch median 206.8 Hz. Levels: peak -4.4 dBFS, DC -7.0e-6.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.78 | 100 | 0.15 |  |
| 6.18 | 80 | 0.13 |  |
| 15.9 | 70 | 0.04 |  |
| 19.72 | 30 | 0.05 | gap |
| 22.8 | 110 | 0.03 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.77 | -24.4 | 0 | 0 | 90 | 2.38 |
| 2 | 4.39 | -25.6 | 0 | 0 | 70 | 3.46 |
| 3 | 9.71 | -26.1 | 0 | 0 | 60 | 4.02 |
| 4 | 3.81 | -25.4 | 0 | 0 | 20 | 4.07 |
| 5 | 3.07 | -25.3 | 0 | 0 | 90 | 3.13 |
| 6 | 0.53 | -26.8 | 0 | 20 | 30 | 1.15 |

## en_US-kristin-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test, did the Harbor Fund grow by 3, 5% last year, an annual row. Who leads, the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents. Thurngundu checked every sentence by ear before the release, the fish arrived fresh at dawn. Packed in ice, thanks.

Stretch: 24.55 s. Silence: lead 50 ms, tail 170 ms, longest internal pause 540 ms.
Pitch median 154.4 Hz. Levels: peak -6.7 dBFS, DC -8.9e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 2.08 | 180 | 0.01 |  |
| 6.14 | 220 | 0.00 |  |
| 16.44 | 220 | 0.14 |  |
| 20.36 | 240 | 0.00 |  |
| 23.9 | 220 | 0.00 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 2.07 | -24.2 | 0 | 50 | 120 | 1.64 |
| 2 | 4.05 | -25.2 | 0 | 50 | 160 | 2.24 |
| 3 | 10.29 | -25.4 | 0 | 50 | 130 | 2.37 |
| 4 | 3.91 | -23.4 | 0 | 80 | 180 | 2.57 |
| 5 | 3.53 | -24.0 | 0 | 50 | 160 | 2.70 |
| 6 | 0.65 | -25.3 | 0 | 50 | 170 | 0.82 |

## en_GB-cori-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test, did the Harper fund grow by three. Five percent last year, an annual row, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents, Thou and Gundy checked every sentence by ear before the release, the fish arrived fresh at dawn, packed in ice, thanks.

Stretch: 22.69 s. Silence: lead 50 ms, tail 160 ms, longest internal pause 630 ms.
Pitch median 209.2 Hz. Levels: peak -9.2 dBFS, DC -1.6e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.68 | 240 | 0.04 |  |
| 6.22 | 250 | 0.01 |  |
| 14.96 | 240 | 0.01 |  |
| 18.66 | 260 | 0.02 |  |
| 22.02 | 290 | 0.03 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.67 | -26.9 | 0 | 50 | 170 | 2.06 |
| 2 | 4.53 | -27.0 | 0 | 60 | 190 | 2.48 |
| 3 | 8.73 | -25.5 | 0 | 50 | 180 | 2.66 |
| 4 | 3.69 | -25.1 | 0 | 50 | 210 | 3.24 |
| 5 | 3.35 | -28.7 | 0 | 40 | 140 | 2.81 |
| 6 | 0.67 | -34.5 | 0 | 30 | 150 | 5.67 |

## en_GB-alba-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbour fund grow by 3? 5% last year. Ananya Rao, who leads the team, wrote that the new library, the faster engine and the quieter rim all changed how people listened to long documents. Tharn Gunduchette every sentence by ear before the release. The fish arrived fresh at dawn packed in ice. Aksa.

Stretch: 20.35 s. Silence: lead 40 ms, tail 130 ms, longest internal pause 420 ms.
Pitch median 198.6 Hz. Levels: peak -4.4 dBFS, DC -3.3e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.7 | 240 | 0.00 |  |
| 4.94 | 210 | 0.00 |  |
| 13.5 | 420 | 0.01 |  |
| 16.92 | 370 | 0.01 |  |
| 19.7 | 240 | 0.00 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.69 | -26.2 | 0 | 40 | 170 | 1.95 |
| 2 | 3.23 | -26.6 | 0 | 60 | 160 | 3.22 |
| 3 | 8.55 | -27.2 | 0 | 40 | 370 | 2.96 |
| 4 | 3.41 | -26.8 | 0 | 40 | 320 | 2.73 |
| 5 | 2.77 | -26.8 | 0 | 40 | 180 | 2.43 |
| 6 | 0.65 | -27.3 | 0 | 50 | 140 | 1.42 |

## en_US-john-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbor fund grow by three? Five percent last year, an annual row. Who leads the team? Wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents, though and gun to checked every sentence by ear before the release. The fish arrived fresh at dawn. Hacked in ice, thanks.

Stretch: 23.25 s. Silence: lead 50 ms, tail 120 ms, longest internal pause 450 ms.
Pitch median 116.7 Hz. Levels: peak -7.0 dBFS, DC -3.5e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.9 | 230 | 0.00 |  |
| 5.76 | 230 | 0.03 |  |
| 15.52 | 190 | 0.01 |  |
| 19.18 | 260 | 0.01 |  |
| 22.62 | 240 | 0.01 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.89 | -28.0 | 0 | 50 | 170 | 1.55 |
| 2 | 3.85 | -29.0 | 0 | 50 | 180 | 2.86 |
| 3 | 9.75 | -27.8 | 0 | 40 | 150 | 3.64 |
| 4 | 3.65 | -29.5 | 0 | 40 | 200 | 3.02 |
| 5 | 3.43 | -29.4 | 0 | 50 | 170 | 2.46 |
| 6 | 0.63 | -31.1 | 0 | 60 | 120 | 1.06 |

## en_US-norman-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbor fund grow by three? Five percent last year, and Andrew Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents. Thereun done to check every sentence by ear before the release. The fish arrived fresh had torn, packed in ice. Thanks.

Stretch: 21.83 s. Silence: lead 50 ms, tail 120 ms, longest internal pause 710 ms.
Pitch median 104.5 Hz. Levels: peak -5.7 dBFS, DC 1.3e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.64 | 200 | 0.00 |  |
| 5.56 | 240 | 0.01 |  |
| 14.96 | 290 | 0.00 |  |
| 18.1 | 290 | 0.01 |  |
| 21.32 | 320 | 0.00 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.63 | -26.3 | 0 | 50 | 150 | 4.00 |
| 2 | 3.91 | -25.6 | 0 | 50 | 180 | 3.50 |
| 3 | 9.39 | -26.9 | 0 | 50 | 220 | 3.90 |
| 4 | 3.13 | -24.7 | 0 | 60 | 230 | 3.60 |
| 5 | 3.21 | -26.5 | 0 | 50 | 260 | 3.36 |
| 6 | 0.51 | -30.1 | 0 | 50 | 120 | 0.28 |

## en_US-joe-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the Harbor Fund grow by 3, 5% last year and Anir Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents. Bar and gun knew checked every sentence by ear before the release. The fish arrived fresh at dawn, packed in ice. Thanks.

Stretch: 20.15 s. Silence: lead 40 ms, tail 220 ms, longest internal pause 390 ms.
Pitch median 97.1 Hz. Levels: peak -2.1 dBFS, DC -6.9e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.7 | 260 | 0.00 |  |
| 5.06 | 200 | 0.01 |  |
| 13.38 | 280 | 0.00 |  |
| 16.68 | 260 | 0.00 |  |
| 19.54 | 230 | 0.00 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.69 | -23.3 | 0 | 40 | 210 | 4.95 |
| 2 | 3.35 | -24.4 | 0 | 40 | 160 | 5.71 |
| 3 | 8.31 | -25.3 | 0 | 30 | 210 | 5.47 |
| 4 | 3.29 | -25.0 | 0 | 60 | 200 | 5.12 |
| 5 | 2.85 | -24.1 | 0 | 40 | 180 | 5.48 |
| 6 | 0.61 | -24.8 | 0 | 40 | 220 | 3.82 |

## en_US-bryce-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbor fund grow by three five percent last year? Ananya Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents. Tharen Gonduchekte every sentence by ear before the release. The fish arrived fresh at dawn, packed in ice. Thanks.

Stretch: 26.49 s. Silence: lead 40 ms, tail 170 ms, longest internal pause 300 ms.
Pitch median 134.1 Hz. Levels: peak -4.7 dBFS, DC -3.9e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 2.04 | 230 | 0.02 |  |
| 6.56 | 280 | 0.21 |  |
| 17.32 | 230 | 0.04 |  |
| 21.72 | 300 | 0.20 |  |
| 25.72 | 280 | 0.16 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 2.03 | -23.3 | 0 | 40 | 160 | 2.89 |
| 2 | 4.51 | -24.2 | 0 | 70 | 120 | 2.82 |
| 3 | 10.75 | -24.6 | 0 | 150 | 150 | 3.92 |
| 4 | 4.39 | -23.5 | 0 | 70 | 200 | 3.55 |
| 5 | 3.99 | -26.2 | 0 | 100 | 180 | 4.57 |
| 6 | 0.77 | -25.0 | 0 | 90 | 170 | 0.94 |

## en_US-mike-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the Harbor Fund grow by 3, 5% last year? And Anya Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listened to long documents. Farangundu checked every sentence by ear before the release. The fish arrived fresh at dawn, packed and ice. Thanks.

Stretch: 18.81 s. Silence: lead 90 ms, tail 90 ms, longest internal pause 370 ms.
Pitch median 123.2 Hz. Levels: peak -4.4 dBFS, DC -6.8e-5.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.5 | 370 | 0.22 |  |
| 4.9 | 290 | 0.21 |  |
| 12.5 | 260 | 0.49 |  |
| 15.64 | 350 | 0.17 |  |
| 18.22 | 210 | 0.10 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.49 | -23.4 | 0 | 80 | 130 | 1.50 |
| 2 | 3.39 | -21.7 | 0 | 220 | 160 | 1.44 |
| 3 | 7.59 | -23.0 | 0 | 120 | 130 | 2.23 |
| 4 | 3.13 | -22.1 | 0 | 120 | 210 | 1.99 |
| 5 | 2.57 | -22.8 | 0 | 130 | 90 | 1.58 |
| 6 | 0.59 | -26.7 | 0 | 120 | 90 | 1.04 |

## en_US-reza_ibrahim-medium

Transcript (onnx-community/whisper-base.en): Thanks.

Stretch: 26.95 s. Silence: lead 630 ms, tail 0 ms, longest internal pause 1170 ms.
Pitch median 111.3 Hz. Levels: peak -3.3 dBFS, DC -1.3e-4.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 2.44 | 550 | 1.00 |  |
| 7.7 | 1170 | 0.14 | gap |
| 18.08 | 550 | 0.95 |  |
| 22.46 | 630 | 1.28 |  |
| 25.96 | 70 | 0.01 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 2.43 | -26.2 | 0 | 630 | 20 | 1.66 |
| 2 | 5.25 | -25.4 | 0 | 510 | 190 | 3.78 |
| 3 | 10.37 | -24.5 | 0 | 970 | 190 | 2.55 |
| 4 | 4.37 | -23.5 | 0 | 360 | 260 | 1.92 |
| 5 | 3.49 | -23.9 | 0 | 360 | 30 | 2.36 |
| 6 | 0.99 | -22.0 | 0 | 70 | 360 | 0.39 |

## en_GB-northern_english_male-medium

Transcript (onnx-community/whisper-base.en): Welcome to the listening test. Did the harbour fund grow by 3? 5% last year? Nanya Rauk, who leads the team, wrote that the new library, the faster engine and the quieter room all changed how people listened to long documents. Farangundoo checked every sentence by ear before the release. The fish arrived fresh at dawn packed in ice. Thanks.

Stretch: 19.35 s. Silence: lead 40 ms, tail 170 ms, longest internal pause 370 ms.
Pitch median 113 Hz. Levels: peak -1.2 dBFS, DC -1.5e-4.

| boundary (s) | gap ms | click ratio | flagged |
|---|---|---|---|
| 1.48 | 180 | 0.00 |  |
| 5.4 | 370 | 0.00 |  |
| 12.82 | 250 | 0.07 |  |
| 15.94 | 270 | 0.00 |  |
| 18.76 | 230 | 0.04 |  |

| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |
|---|---|---|---|---|---|---|
| 1 | 1.47 | -21.1 | 0 | 40 | 130 | 1.32 |
| 2 | 3.91 | -22.3 | 0 | 40 | 310 | 1.92 |
| 3 | 7.41 | -22.1 | 0 | 50 | 240 | 2.87 |
| 4 | 3.11 | -21.7 | 0 | 0 | 210 | 4.60 |
| 5 | 2.81 | -22.9 | 0 | 50 | 220 | 3.59 |
| 6 | 0.59 | -21.8 | 0 | 10 | 180 | 0.99 |
