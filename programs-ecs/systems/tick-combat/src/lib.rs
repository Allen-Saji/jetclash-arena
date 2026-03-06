use bolt_lang::*;
use match_state::MatchState;
use player_state::PlayerState;
use projectile_pool::ProjectilePool;
use arena_config::ArenaConfig;

declare_id!("BRdU8TEqfja1aCwhpTznxs7N5wtsEK9XwMrQpgAcXYj");

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
        let p1 = &mut ctx.accounts.player_state_p1;
        let p2 = &mut ctx.accounts.player_state_p2;
        let pool = &mut ctx.accounts.projectile_pool;
        let arena = &ctx.accounts.arena_config;

        if !ms.is_active { return Ok(ctx.accounts); }

        let tick = ms.tick;

        // Move projectiles, check bounds/platform collision
        for proj in pool.projectiles.iter_mut() {
            if !proj.active { continue; }
            proj.pos_x += proj.vel_x;
            proj.pos_y += proj.vel_y;
            proj.ttl_ticks = proj.ttl_ticks.saturating_sub(1);

            if proj.ttl_ticks == 0
                || proj.pos_x < 0 || proj.pos_x > arena.world_width
                || proj.pos_y < 0 || proj.pos_y > arena.world_height
            {
                proj.active = false;
                continue;
            }

            let (hw, hh) = if proj.is_rocket { (ROCKET_HALF_W, ROCKET_HALF_H) } else { (BULLET_HALF_W, BULLET_HALF_H) };
            for i in 0..(arena.platform_count as usize) {
                let plat = &arena.platforms[i];
                if proj.pos_x + hw > plat.x && proj.pos_x - hw < plat.x + plat.w
                    && proj.pos_y + hh > plat.y && proj.pos_y - hh < plat.y + plat.h
                {
                    proj.active = false;
                    break;
                }
            }
        }

        // Projectile-player collision
        for proj in pool.projectiles.iter_mut() {
            if !proj.active { continue; }
            let (hw, hh) = if proj.is_rocket { (ROCKET_HALF_W, ROCKET_HALF_H) } else { (BULLET_HALF_W, BULLET_HALF_H) };

            if proj.owner == 1 && !p1.is_dead && !p1.is_invincible
                && rects_overlap(proj.pos_x, proj.pos_y, hw, hh, p1.pos_x, p1.pos_y, PLAYER_HALF_W, PLAYER_HALF_H)
            {
                apply_damage(p1, proj.damage, tick, ms, p2, false);
                proj.active = false;
                continue;
            }
            if proj.owner == 0 && !p2.is_dead && !p2.is_invincible
                && rects_overlap(proj.pos_x, proj.pos_y, hw, hh, p2.pos_x, p2.pos_y, PLAYER_HALF_W, PLAYER_HALF_H)
            {
                apply_damage(p2, proj.damage, tick, ms, p1, true);
                proj.active = false;
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_state_p1: PlayerState,
        pub player_state_p2: PlayerState,
        pub projectile_pool: ProjectilePool,
        pub arena_config: ArenaConfig,
    }
}

fn rects_overlap(ax: i32, ay: i32, ahw: i32, ahh: i32, bx: i32, by: i32, bhw: i32, bhh: i32) -> bool {
    (ax - bx).abs() < ahw + bhw && (ay - by).abs() < ahh + bhh
}

fn apply_damage(victim: &mut PlayerState, damage: u8, tick: u32, ms: &mut MatchState, killer: &mut PlayerState, killer_is_p1: bool) {
    if victim.hp <= damage {
        victim.hp = 0;
        victim.is_dead = true;
        victim.respawn_at_tick = tick + RESPAWN_DELAY_TICKS;
        victim.deaths += 1;
        killer.kills += 1;
        killer.score += KILL_SCORE;
        if killer_is_p1 {
            ms.p1_kills = killer.kills;
            ms.p1_score = killer.score;
        } else {
            ms.p2_kills = killer.kills;
            ms.p2_score = killer.score;
        }
    } else {
        victim.hp -= damage;
    }
}
