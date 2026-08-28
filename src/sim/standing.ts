import type { Latitude } from "./types"

/**
 * The Standing Order: the brief a Unit carries and consults all afternoon,
 * rather than an Order it carries out once (ADR-0007). It is one question —
 * how far the Unit may act on its own account — so the brief is the rung.
 *
 * Latitude is one rung of an ordered ladder, and every rung above the lowest is
 * spent in metres from the Post — the ground the player last gave the Unit. A
 * Unit acting on its own account can therefore drift off the ground it was
 * given and can never choose different ground, which is the whole of what keeps
 * a well-briefed army from commanding itself.
 */

/** The ladder in order, from giving ground to taking it. */
export const LATITUDES: Latitude[] = ["stand-off", "hold-ground", "close-up", "follow-up"]

/**
 * What a Unit carries until somebody says otherwise: it stands where it was
 * put and it shoots what comes into reach, which is exactly what a Unit did
 * before Standing Orders existed.
 */
export function defaultStanding(): Latitude {
  return "hold-ground"
}

/**
 * Metres a Unit at this rung may put between itself and its Post by its own
 * act. One number governs both directions: giving ground and taking it are the
 * same permission asked from opposite sides, and measuring both as a radius
 * means a Unit that has drifted cannot keep drifting.
 *
 * `stand-off` is the longest because it is the only rung that has to buy its
 * own escape: a screen that may give fifty metres is a screen that is caught.
 * It is still short of the three hundred metres at which a Unit notices an
 * enemy at all, so a Unit that stands off is not a Unit that leaves.
 *
 * `close-up` is a hundred — enough to bring a battery on the next rise under
 * fire, not enough to reach the enemy's line from a position behind your own.
 * `follow-up` is three hundred, which is the ground an enemy who has given way
 * covers before he is out of reach, and no further: this is a follow-up and
 * not a Pursuit. A Pursuit is a Charge the player gives at a mob and it takes
 * the regiment wherever the mob goes, which is exactly the thing a leash is
 * here to forbid, so no brief buys one.
 */
export function leash(latitude: Latitude): number {
  switch (latitude) {
    case "stand-off":
      return 250
    case "hold-ground":
      return 0
    case "close-up":
      return 100
    case "follow-up":
      return 300
  }
}

/** How the rung is written on a button and in a Dispatch. */
export function describeLatitude(latitude: Latitude): string {
  return latitude.replaceAll("-", " ")
}

/**
 * What the rung permits, in the words the button says it in on hover. The
 * metres are read off `leash` rather than written into the prose, so a tuned
 * dial cannot leave the definition lying about what the Unit will do.
 */
export function explainLatitude(latitude: Latitude): string {
  const bound = leash(latitude)
  switch (latitude) {
    case "stand-off":
      return `gives ground rather than be closed with, up to ${bound}m off its Post — and turns its back to do it`
    case "hold-ground":
      return "stands where it was put and shoots what comes into reach, and gives no ground and takes none"
    case "close-up":
      return `walks up to ${bound}m off its Post to bring an enemy under its fire, and stops the moment anything bears`
    case "follow-up":
      return `takes up to ${bound}m off its Post from an enemy who has broken, and closes up on one that has not`
  }
}
