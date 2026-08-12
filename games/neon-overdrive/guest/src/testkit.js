import { FIXED_STEP_SECONDS } from "./simulation.js";
import { COLORS } from "./mechanics/index.js";

export function createNeonDebug({
  simulation,
  renderer,
  getMotionPolicy,
  canAdvance,
  freezePresentation,
  resumePresentation,
  feedFrame,
  drainEvents,
  resources,
}) {
  function lifeAggregate(entities, name) {
    let totalLife = 0;
    for (const entity of entities) {
      if (!Number.isFinite(entity.life)) {
        throw new TypeError(`Neon ${name} presentation life must be finite.`);
      }
      totalLife += entity.life;
    }
    return { count: entities.length, totalLife: Number(totalLife.toFixed(6)) };
  }

  function observe() {
    const rawChain = simulation.state.chain;
    const pickupAggregate = {
      count: simulation.state.pickups.length,
      driveCount: 0,
      driveValueTotal: 0,
      scoreCount: 0,
      scoreValueTotal: 0,
    };
    for (const pickup of simulation.state.pickups) {
      if (pickup.type === "drive") {
        pickupAggregate.driveCount += 1;
        pickupAggregate.driveValueTotal += pickup.value;
      } else if (pickup.type === "score") {
        pickupAggregate.scoreCount += 1;
        pickupAggregate.scoreValueTotal += pickup.value;
      } else {
        throw new RangeError(`Unknown Neon pickup type: ${pickup.type}`);
      }
    }
    return {
      ...simulation.observe(),
      runTick: simulation.state.runTicks,
      presentationTime: simulation.state.presentationTime,
      hitStop: {
        remainingTicks: simulation.state.hitStopTicks,
      },
      sequence: {
        locked: simulation.state.sequenceLock,
        kind: simulation.state.pendingAction,
        remainingTicks: simulation.state.pendingTicks,
      },
      directorClock: {
        nonBossTicks: simulation.state.endlessDirectorTicks,
        time: simulation.state.director.time,
      },
      presentationEntities: {
        particles: lifeAggregate(simulation.state.particles, "particle"),
        ringParticleCount: simulation.state.particles.filter((particle) => particle.type === "ring")
          .length,
        lineParticleCount: simulation.state.particles.filter((particle) => particle.type === "line")
          .length,
        floaters: lifeAggregate(simulation.state.floaters, "floater"),
      },
      presentationState: {
        shake: simulation.state.shake,
        danger: simulation.state.danger,
        tilt: simulation.state.player.tilt,
        auraPulse: simulation.state.player.auraPulse,
        hitbox: {
          coreVisible: simulation.state.player.focus || simulation.state.gameSettings.showHitbox,
          grazeRingVisible: simulation.state.player.focus,
        },
        goldSparkCount: simulation.state.particles.filter(
          (particle) => particle.type === "spark" && particle.color === COLORS.gold,
        ).length,
      },
      stats: {
        bulletsCancelled: simulation.state.stats.bulletsCancelled,
        kills: simulation.state.kills,
      },
      pickupAggregate,
      collisionTargets: simulation.state.enemies.slice(-8).map((enemy) => ({
        id: enemy.id,
        kind: enemy.type,
        health: enemy.hp,
        maxHealth: enemy.maxHp,
        contactDamage: enemy.contactDamage,
      })),
      combat: {
        playerPower: simulation.state.player.power,
        overdrive: {
          remaining: simulation.state.overdrive,
          max: simulation.state.overdriveMax,
        },
        rankPenalty: simulation.state.rankPenalty,
        chain: {
          raw: rawChain,
          multiplier: (1 + rawChain * 0.04) * (simulation.state.overdrive > 0 ? 2 : 1),
        },
      },
    };
  }

  function mutate(action, payload) {
    switch (action) {
      case "prepareDrive":
        if (payload !== undefined) throw new TypeError("prepareDrive has no payload.");
        simulation.controls.prepareDrive();
        break;
      case "prepareGuardBoundary":
        if (payload !== undefined) throw new TypeError("prepareGuardBoundary has no payload.");
        simulation.controls.prepareGuardBoundary();
        break;
      case "protectPlayer":
        if (payload !== undefined) throw new TypeError("protectPlayer has no payload.");
        simulation.controls.protectPlayer();
        break;
      case "prepareResult":
        simulation.controls.prepareResult(payload);
        break;
      case "spawnEnemy":
        simulation.controls.spawnEnemy(payload);
        break;
      case "spawnBoss":
        simulation.controls.spawnBoss(payload);
        break;
      case "spawnPlayerBullet":
        simulation.controls.spawnPlayerBullet(payload);
        break;
      case "prepareGraze":
        if (payload !== undefined) throw new TypeError("prepareGraze has no payload.");
        simulation.controls.prepareGraze();
        break;
      case "prepareThreat":
        simulation.controls.prepareThreat(payload);
        break;
      case "prepareCollisionPriority":
        if (payload !== undefined) throw new TypeError("prepareCollisionPriority has no payload.");
        simulation.controls.prepareCollisionPriority();
        break;
      case "prepareContactDamage":
        if (payload !== undefined) throw new TypeError("prepareContactDamage has no payload.");
        simulation.controls.prepareContactDamage();
        break;
      case "prepareReverseEnemyHit":
        if (payload !== undefined) throw new TypeError("prepareReverseEnemyHit has no payload.");
        simulation.controls.prepareReverseEnemyHit();
        break;
      case "preparePendingDeathAbsorption":
        if (payload !== undefined)
          throw new TypeError("preparePendingDeathAbsorption has no payload.");
        simulation.controls.preparePendingDeathAbsorption();
        break;
      case "preparePrunedPlayerShots":
        if (payload !== undefined) throw new TypeError("preparePrunedPlayerShots has no payload.");
        simulation.controls.preparePrunedPlayerShots();
        break;
      case "prepareDiverPowerKill":
        if (payload !== undefined) throw new TypeError("prepareDiverPowerKill has no payload.");
        simulation.controls.prepareDiverPowerKill();
        break;
      case "prepareEliteKill":
        if (payload !== undefined) throw new TypeError("prepareEliteKill has no payload.");
        simulation.controls.prepareEliteKill();
        break;
      case "prepareBossMissileHit":
        if (payload !== undefined) throw new TypeError("prepareBossMissileHit has no payload.");
        simulation.controls.prepareBossMissileHit();
        break;
      case "prepareMissileFlight":
        if (payload !== undefined) throw new TypeError("prepareMissileFlight has no payload.");
        simulation.controls.prepareMissileFlight();
        break;
      case "prepareBossPhaseBreak":
        if (payload !== undefined) throw new TypeError("prepareBossPhaseBreak has no payload.");
        simulation.controls.prepareBossPhaseBreak();
        break;
      case "damageBoss":
        simulation.controls.damageBoss(payload);
        break;
      case "hitPlayer":
        if (payload !== undefined) throw new TypeError("hitPlayer has no payload.");
        simulation.controls.hitPlayer();
        break;
      case "showUpgrade":
        if (payload !== undefined) throw new TypeError("showUpgrade has no payload.");
        simulation.controls.showUpgrade();
        break;
      case "offerUpgrades":
        simulation.controls.offerUpgrades(payload);
        break;
      case "finish":
        if (
          payload === null ||
          typeof payload !== "object" ||
          Array.isArray(payload) ||
          Object.keys(payload).length !== 2 ||
          !Object.hasOwn(payload, "victory") ||
          !Object.hasOwn(payload, "labelId") ||
          typeof payload.victory !== "boolean" ||
          !["ritualComplete", "signalLost", "timeComplete"].includes(payload.labelId)
        ) {
          throw new TypeError("finish payload must be exact.");
        }
        simulation.controls.finish(payload.victory, payload.labelId);
        break;
      default:
        throw new RangeError(`Unknown Neon mutation: ${action}`);
    }
  }

  return Object.freeze({
    advance(ticks) {
      if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 36_000) {
        throw new RangeError("advance ticks must be a safe integer from 0 through 36000.");
      }
      if (canAdvance()) {
        for (let index = 0; index < ticks; index += 1) simulation.step(FIXED_STEP_SECONDS);
      }
      renderer.render(simulation.state, 0, getMotionPolicy());
      return observe();
    },
    observe,
    command(command) {
      simulation.command(command);
      return observe();
    },
    mutate(action, payload) {
      mutate(action, payload);
      return observe();
    },
    drainEvents,
    freezePresentation,
    resumePresentation,
    feedFrame,
    resources,
  });
}
