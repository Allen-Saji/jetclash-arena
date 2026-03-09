use bolt_lang::*;
use player_pool::PlayerPool;
use projectile_pool::ProjectilePool;
use match_state::MatchState;

declare_id!("9wPRRXi3yManMXSadD8QU2QzEzNyEbFbj5t8fCFuSUS8");

const MOVE_SPEED: i32 = 25000;
const JETPACK_FORCE: i32 = 42000;
const FUEL_DRAIN_PER_TICK: u16 = 100;
const DASH_SPEED: i32 = 50000;
const DASH_COOLDOWN_TICKS: u32 = 60;

const PRIMARY_DAMAGE: u8 = 12;
const PRIMARY_SPEED: i32 = 70000;
const PRIMARY_COOLDOWN_TICKS: u32 = 6;
const PRIMARY_MAX_AMMO: u8 = 50;
const PRIMARY_RELOAD_TICKS: u32 = 36;
const PRIMARY_TTL_TICKS: u16 = 90;

const SECONDARY_DAMAGE: u8 = 40;
const SECONDARY_SPEED: i32 = 45000;
const SECONDARY_COOLDOWN_TICKS: u32 = 36;
const SECONDARY_MAX_AMMO: u8 = 5;
const SECONDARY_RELOAD_TICKS: u32 = 75;
const SECONDARY_TTL_TICKS: u16 = 120;

#[derive(serde::Deserialize)]
struct InputArgs {
    player_index: u8,
    move_dir: i8,
    jet: bool,
    dash: bool,
    shoot_primary: bool,
    shoot_secondary: bool,
    input_seq: u32,
}

#[system]
pub mod process_input {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: InputArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let match_state = &ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;
        let projectile_pool = &mut ctx.accounts.projectile_pool;

        if !match_state.is_active {
            return Ok(ctx.accounts);
        }

        let idx = args.player_index as usize;
        require!(idx < player_pool::MAX_PLAYERS, ErrorProcessInput::InvalidPlayerIndex);
        require!(pool.players[idx].is_joined, ErrorProcessInput::PlayerNotJoined);

        let current_tick = match_state.tick;

        // We need to work with the player data via index
        let player = &mut pool.players[idx];

        if player.is_dead {
            return Ok(ctx.accounts);
        }

        player.input_seq = args.input_seq;

        // Movement
        let speed_mult = player.speed_multiplier as i32;
        let move_per_tick = (MOVE_SPEED * speed_mult) / (30 * 100);

        if args.move_dir < 0 {
            player.vel_x = -move_per_tick;
            player.facing_right = false;
        } else if args.move_dir > 0 {
            player.vel_x = move_per_tick;
            player.facing_right = true;
        } else {
            player.vel_x = 0;
        }

        // Jetpack
        if args.jet && player.fuel > 0 {
            player.vel_y -= JETPACK_FORCE / 30;
            player.fuel = player.fuel.saturating_sub(FUEL_DRAIN_PER_TICK);
        }

        // Dash
        if args.dash && current_tick >= player.dash_cooldown_tick && !player.dash_active {
            player.dash_active = true;
            player.dash_cooldown_tick = current_tick + DASH_COOLDOWN_TICKS;
            let dash_per_tick = DASH_SPEED / 30;
            player.vel_x = if player.facing_right { dash_per_tick } else { -dash_per_tick };
        }

        // Primary weapon
        if args.shoot_primary
            && current_tick >= player.primary_cooldown_tick
            && current_tick >= player.primary_reload_tick
            && player.primary_ammo > 0
        {
            player.primary_ammo -= 1;
            player.primary_cooldown_tick = current_tick + PRIMARY_COOLDOWN_TICKS;
            spawn_projectile(
                projectile_pool, player.pos_x, player.pos_y - 2000,
                if player.facing_right { PRIMARY_SPEED / 30 } else { -(PRIMARY_SPEED / 30) },
                0, PRIMARY_DAMAGE, args.player_index, false, PRIMARY_TTL_TICKS,
            );
            if player.primary_ammo == 0 {
                player.primary_reload_tick = current_tick + PRIMARY_RELOAD_TICKS;
                player.primary_ammo = PRIMARY_MAX_AMMO;
            }
        }

        // Secondary weapon
        if args.shoot_secondary
            && current_tick >= player.secondary_cooldown_tick
            && current_tick >= player.secondary_reload_tick
            && player.secondary_ammo > 0
        {
            player.secondary_ammo -= 1;
            player.secondary_cooldown_tick = current_tick + SECONDARY_COOLDOWN_TICKS;
            spawn_projectile(
                projectile_pool, player.pos_x, player.pos_y - 2000,
                if player.facing_right { SECONDARY_SPEED / 30 } else { -(SECONDARY_SPEED / 30) },
                0, SECONDARY_DAMAGE, args.player_index, true, SECONDARY_TTL_TICKS,
            );
            if player.secondary_ammo == 0 {
                player.secondary_reload_tick = current_tick + SECONDARY_RELOAD_TICKS;
                player.secondary_ammo = SECONDARY_MAX_AMMO;
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub player_pool: PlayerPool,
        pub match_state: MatchState,
        pub projectile_pool: ProjectilePool,
    }
}

#[error_code]
pub enum ErrorProcessInput {
    #[msg("Invalid player index")]
    InvalidPlayerIndex,
    #[msg("Player has not joined the match")]
    PlayerNotJoined,
}

fn spawn_projectile(
    pool: &mut ProjectilePool, x: i32, y: i32, vel_x: i32, vel_y: i32,
    damage: u8, owner: u8, is_rocket: bool, ttl: u16,
) {
    for proj in pool.projectiles.iter_mut() {
        if !proj.active {
            proj.pos_x = x; proj.pos_y = y;
            proj.vel_x = vel_x; proj.vel_y = vel_y;
            proj.damage = damage; proj.owner = owner;
            proj.is_rocket = is_rocket; proj.ttl_ticks = ttl;
            proj.active = true;
            return;
        }
    }
    let proj = &mut pool.projectiles[0];
    proj.pos_x = x; proj.pos_y = y;
    proj.vel_x = vel_x; proj.vel_y = vel_y;
    proj.damage = damage; proj.owner = owner;
    proj.is_rocket = is_rocket; proj.ttl_ticks = ttl;
    proj.active = true;
}
