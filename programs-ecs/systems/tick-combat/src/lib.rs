use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;
use projectile_pool::ProjectilePool;

declare_id!("FLneDscsPFESuhmBeiJ7K3fe685hNFyWdTg3jvzCXyWr");

const KILL_SCORE: u32 = 100;
const RESPAWN_DELAY_TICKS: u32 = 75;
const BULLET_HALF_W: i32 = 1500;
const BULLET_HALF_H: i32 = 800;
const ROCKET_HALF_W: i32 = 2500;
const ROCKET_HALF_H: i32 = 1500;
const PLAYER_HALF_W: i32 = 2500;
const PLAYER_HALF_H: i32 = 3000;

#[system]
pub mod tick_combat {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &mut ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;
        let projs = &mut ctx.accounts.projectile_pool;

        if !ms.is_active { return Ok(ctx.accounts); }

        let tick = ms.tick;

        // Projectile-player collision: check each projectile against all players except owner
        for pi in 0..projectile_pool::MAX_PROJECTILES {
            if !projs.projectiles[pi].active { continue; }

            let proj_x = projs.projectiles[pi].pos_x;
            let proj_y = projs.projectiles[pi].pos_y;
            let proj_owner = projs.projectiles[pi].owner;
            let proj_damage = projs.projectiles[pi].damage;
            let is_rocket = projs.projectiles[pi].is_rocket;
            let (hw, hh) = if is_rocket { (ROCKET_HALF_W, ROCKET_HALF_H) } else { (BULLET_HALF_W, BULLET_HALF_H) };

            for vi in 0..player_pool::MAX_PLAYERS {
                if vi == proj_owner as usize { continue; }
                let victim = &pool.players[vi];
                if !victim.is_joined || victim.is_dead || victim.is_invincible { continue; }

                if rects_overlap(proj_x, proj_y, hw, hh, victim.pos_x, victim.pos_y, PLAYER_HALF_W, PLAYER_HALF_H) {
                    let victim = &mut pool.players[vi];
                    if victim.hp <= proj_damage {
                        victim.hp = 0;
                        victim.is_dead = true;
                        victim.respawn_at_tick = tick + RESPAWN_DELAY_TICKS;
                        victim.deaths += 1;

                        let killer = &mut pool.players[proj_owner as usize];
                        killer.kills += 1;
                        killer.score += KILL_SCORE;
                    } else {
                        victim.hp -= proj_damage;
                    }

                    projs.projectiles[pi].active = false;
                    break;
                }
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
        pub projectile_pool: ProjectilePool,
    }
}

fn rects_overlap(ax: i32, ay: i32, ahw: i32, ahh: i32, bx: i32, by: i32, bhw: i32, bhh: i32) -> bool {
    (ax - bx).abs() < ahw + bhw && (ay - by).abs() < ahh + bhh
}
