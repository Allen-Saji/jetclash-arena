use bolt_lang::*;
use match_state::MatchState;
use player_state::PlayerState;
use arena_config::ArenaConfig;

declare_id!("BHwje821iKJ3TCWwtRCQkiuBefJym41zRePDwQQ5ci6r");

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
        let p1 = &mut ctx.accounts.player_state_p1;
        let p2 = &mut ctx.accounts.player_state_p2;
        let arena = &ctx.accounts.arena_config;

        if !ms.is_active {
            return Ok(ctx.accounts);
        }

        // Timer
        if ms.ticks_remaining == 0 {
            end_match(ms, p1, p2);
            return Ok(ctx.accounts);
        }
        ms.ticks_remaining -= 1;
        ms.tick += 1;
        let tick = ms.tick;

        let gravity_per_tick = arena.gravity / 30;
        apply_physics(p1, gravity_per_tick, arena);
        apply_physics(p2, gravity_per_tick, arena);
        resolve_platforms(p1, arena);
        resolve_platforms(p2, arena);

        // Respawn dead players
        if p1.is_dead && tick >= p1.respawn_at_tick {
            respawn_player(p1, arena, 0, tick);
        }
        if p2.is_dead && tick >= p2.respawn_at_tick {
            respawn_player(p2, arena, 1, tick);
        }

        // Clear expired buffs
        if p1.is_invincible && tick >= p1.invincible_until_tick {
            p1.is_invincible = false;
        }
        if p2.is_invincible && tick >= p2.invincible_until_tick {
            p2.is_invincible = false;
        }
        if p1.speed_multiplier > 100 && tick >= p1.speed_buff_until_tick {
            p1.speed_multiplier = 100;
        }
        if p2.speed_multiplier > 100 && tick >= p2.speed_buff_until_tick {
            p2.speed_multiplier = 100;
        }
        if p1.dash_active && tick >= p1.dash_cooldown_tick.saturating_sub(54) {
            p1.dash_active = false;
        }
        if p2.dash_active && tick >= p2.dash_cooldown_tick.saturating_sub(54) {
            p2.dash_active = false;
        }

        // Kill cap check
        if ms.p1_kills >= KILL_CAP || ms.p2_kills >= KILL_CAP {
            end_match(ms, p1, p2);
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_state_p1: PlayerState,
        pub player_state_p2: PlayerState,
        pub arena_config: ArenaConfig,
    }
}

fn apply_physics(player: &mut PlayerState, gravity_per_tick: i32, arena: &ArenaConfig) {
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

fn resolve_platforms(player: &mut PlayerState, arena: &ArenaConfig) {
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

fn respawn_player(player: &mut PlayerState, arena: &ArenaConfig, idx: u8, tick: u32) {
    let si = if idx == 0 { 0 } else { 1usize.min(arena.spawn_point_count as usize - 1) };
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

fn end_match(ms: &mut MatchState, p1: &PlayerState, p2: &PlayerState) {
    ms.is_active = false;
    ms.winner = if p1.kills > p2.kills { 1 } else if p2.kills > p1.kills { 2 } else { 3 };
}
