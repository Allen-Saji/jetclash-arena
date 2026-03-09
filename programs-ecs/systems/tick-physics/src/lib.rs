use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;
use arena_config::ArenaConfig;

declare_id!("2KRfGTD6TqhLxhr65vkhoJ2oty6LEEgTrXVBF63DmbwG");

const KILL_CAP: u16 = 15;
const INVINCIBILITY_TICKS: u32 = 45;
const FUEL_REGEN_PER_TICK: u16 = 67;
const FUEL_MAX: u16 = 10000;
const PLAYER_HALF_W: i32 = 2500;
const PLAYER_HALF_H: i32 = 3000;

#[system]
pub mod tick_physics {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &mut ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;
        let arena = &ctx.accounts.arena_config;

        if !ms.is_active {
            return Ok(ctx.accounts);
        }

        // Timer
        if ms.ticks_remaining == 0 {
            end_match(ms, pool);
            return Ok(ctx.accounts);
        }
        ms.ticks_remaining -= 1;
        ms.tick += 1;
        let tick = ms.tick;

        let gravity_per_tick = arena.gravity / 30;

        for i in 0..player_pool::MAX_PLAYERS {
            if !pool.players[i].is_joined { continue; }
            apply_physics(&mut pool.players[i], gravity_per_tick, arena);
            resolve_platforms(&mut pool.players[i], arena);

            // Respawn dead players
            if pool.players[i].is_dead && tick >= pool.players[i].respawn_at_tick {
                respawn_player(&mut pool.players[i], arena, i, tick);
            }

            // Clear expired buffs
            if pool.players[i].is_invincible && tick >= pool.players[i].invincible_until_tick {
                pool.players[i].is_invincible = false;
            }
            if pool.players[i].speed_multiplier > 100 && tick >= pool.players[i].speed_buff_until_tick {
                pool.players[i].speed_multiplier = 100;
            }
            if pool.players[i].dash_active && tick >= pool.players[i].dash_cooldown_tick.saturating_sub(54) {
                pool.players[i].dash_active = false;
            }
        }

        // Kill cap check
        for i in 0..player_pool::MAX_PLAYERS {
            if pool.players[i].is_joined && pool.players[i].kills >= KILL_CAP {
                end_match(ms, pool);
                break;
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
        pub arena_config: ArenaConfig,
    }
}

fn apply_physics(player: &mut player_pool::PlayerData, gravity_per_tick: i32, arena: &ArenaConfig) {
    if player.is_dead { return; }
    player.vel_y += gravity_per_tick;
    player.pos_x += player.vel_x;
    player.pos_y += player.vel_y;

    let ground_y = arena.world_height - 6000;
    if player.pos_y >= ground_y {
        player.fuel = (player.fuel + FUEL_REGEN_PER_TICK).min(FUEL_MAX);
    }

    player.pos_x = player.pos_x.clamp(0, arena.world_width);
    if player.pos_y > arena.world_height {
        player.pos_y = arena.world_height;
        player.vel_y = 0;
    }
    if player.pos_y < 0 {
        player.pos_y = 0;
        player.vel_y = 0;
    }
}

fn resolve_platforms(player: &mut player_pool::PlayerData, arena: &ArenaConfig) {
    if player.is_dead { return; }
    for i in 0..(arena.platform_count as usize) {
        let plat = &arena.platforms[i];
        let player_bottom = player.pos_y + PLAYER_HALF_H;
        let player_top = player.pos_y - PLAYER_HALF_H;
        let plat_top = plat.y;

        if player.pos_x + PLAYER_HALF_W > plat.x
            && player.pos_x - PLAYER_HALF_W < plat.x + plat.w
            && player.vel_y >= 0
            && player_bottom >= plat_top
            && player_top < plat_top
        {
            player.pos_y = plat_top - PLAYER_HALF_H;
            player.vel_y = 0;
            player.fuel = (player.fuel + FUEL_REGEN_PER_TICK).min(FUEL_MAX);
        }
    }
}

fn respawn_player(player: &mut player_pool::PlayerData, arena: &ArenaConfig, idx: usize, tick: u32) {
    let si = idx.min(arena.spawn_point_count as usize - 1);
    player.pos_x = arena.spawn_points[si].x;
    player.pos_y = arena.spawn_points[si].y;
    player.vel_x = 0;
    player.vel_y = 0;
    player.hp = 100;
    player.fuel = FUEL_MAX;
    player.is_dead = false;
    player.is_invincible = true;
    player.invincible_until_tick = tick + INVINCIBILITY_TICKS;
    player.primary_ammo = 50;
    player.secondary_ammo = 5;
}

fn end_match(ms: &mut MatchState, pool: &PlayerPool) {
    ms.is_active = false;
    let mut best_idx: usize = 0;
    let mut best_kills: u16 = 0;
    let mut draw = false;
    for i in 0..player_pool::MAX_PLAYERS {
        if !pool.players[i].is_joined { continue; }
        if pool.players[i].kills > best_kills {
            best_kills = pool.players[i].kills;
            best_idx = i;
            draw = false;
        } else if pool.players[i].kills == best_kills && pool.players[i].kills > 0 {
            draw = true;
        }
    }
    ms.winner = if draw { 5 } else { (best_idx as u8) + 1 };
}
