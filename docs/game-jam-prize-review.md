# Game Jam prize review

Farseek is the second-place entry and its announced prize is 3 TAO. An award announcement alone does not establish an on-chain payment. The declared entry wallet matches `5HRAPidoCoZPYsLE2q7Ge8WWAfQ3XZpSYoz7aGYJYRmMQpt1`.

| Evidence                                                                                                   | Verified observation                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Official winners](https://x.com/404gen_/status/2105275592937509196)                                       | Farseek, second place, 3 TAO                                                                                  |
| [Official entry](https://github.com/404-Repo/404-game-jam/blob/main/entries/farseek.json)                  | The wallet matches the owner's address                                                                        |
| [Prize rules](https://github.com/404-Repo/404-game-jam#prizes)                                             | Payment within 30 days of the announcement, calendar says by 28 October                                       |
| [Community announcement](https://x.com/404gen_/status/2107166659253317745)                                 | Published `2026-10-05T17:50:55Z`, GitHub voting open to everyone until 12 October 23:59 UTC                   |
| [Account explorer](https://taostats.io/account/5HRAPidoCoZPYsLE2q7Ge8WWAfQ3XZpSYoz7aGYJYRmMQpt1/transfers) | Finney block `9232363`, `2026-10-07T16:35:12Z`, free balance `0.048659866 TAO`, root stake `10.174999411 TAO` |
| Public explorer transfer API                                                                               | Both account and incoming-transfer requests return HTTP 401; no transfer history received                     |

The current [voting rules](https://github.com/404-Repo/404-game-jam#judging) reserve votes to entrants and close at 12 October 10:00 UTC. They exclude the podium from the 0.5 TAO community prize. These restrictions differ from the newer announcement; the audit does not resolve that contradiction.

The parallel agent performed public read-only HTTP checks. Account amounts are observations at the specified block, not current balance guarantees. Neither liquid balance nor an inaccessible journal proves that no prize transfer occurred. A transaction hash or accessible incoming-transfer history is required to establish payment. No wallet credentials or transactions were used, and no organiser was contacted.
