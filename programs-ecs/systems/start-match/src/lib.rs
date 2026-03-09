use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;
use projectile_pool::ProjectilePool;
use pickup_state::PickupState;

declare_id!("EEsbBTCJmubjjmKcLEgk4aQivRKyG5D8kGzALx2TTN1e");

const MATCH_TICKS: u32 = 3600;

#[derive(serde::Deserialize)]
struct StartMatchArgs {
    /// Spawn positions for each player [x0,y0, x1,y1, x2,y2, x3,y3]
    spawn_positions: Vec<[i32; 2]>,
}

#[system]
pub mod start_match {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: StartMatchArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let ms = &mut ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;

        require!(ms.is_lobby, ErrorStartMatch::NotInLobby);
        require!(!ms.is_active, ErrorStartMatch::AlreadyActive);
        require!(ms.player_count >= ms.min_players, ErrorStartMatch::NotEnoughPlayers);

        // Check all joined players are ready
        let required_mask = (1u8 << ms.player_count) - 1;
        require!(ms.ready_mask & required_mask == required_mask, ErrorStartMatch::NotAllReady);

        // Transition from lobby to active match
        ms.is_lobby = false;
        ms.is_active = true;
        ms.tick = 0;
        ms.ticks_remaining = MATCH_TICKS;
        ms.winner = 0;

        // Reset all joined players with spawn positions from args
        for i in 0..(ms.player_count as usize) {
            let spawn = if i < args.spawn_positions.len() {
                args.spawn_positions[i]
            } else {
                [50000, 132000] // fallback
            };
            let p = &mut pool.players[i];
            p.pos_x = spawn[0];
            p.pos_y = spawn[1];
            p.vel_x = 0;
            p.vel_y = 0;
            p.hp = 100;
            p.fuel = 10000;
            p.primary_ammo = 50;
            p.secondary_ammo = 5;
            p.facing_right = i % 2 == 0;
            p.is_dead = false;
            p.is_invincible = true;
            p.invincible_until_tick = 90;
            p.dash_active = false;
            p.dash_cooldown_tick = 0;
            p.primary_cooldown_tick = 0;
            p.secondary_cooldown_tick = 0;
            p.primary_reload_tick = 0;
            p.secondary_reload_tick = 0;
            p.speed_multiplier = 100;
            p.speed_buff_until_tick = 0;
            p.kills = 0;
            p.deaths = 0;
            p.score = 0;
            p.input_seq = 0;
        }

        // Reset projectile pool
        for proj in ctx.accounts.projectile_pool.projectiles.iter_mut() {
            proj.active = false;
        }

        // Reset pickups
        for pickup in ctx.accounts.pickup_state.pickups.iter_mut() {
            pickup.is_consumed = false;
            pickup.respawn_at_tick = 0;
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
        pub projectile_pool: ProjectilePool,
        pub pickup_state: PickupState,
    }
}

#[error_code]
pub enum ErrorStartMatch {
    #[msg("Room is not in lobby state")]
    NotInLobby,
    #[msg("Match is already active")]
    AlreadyActive,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("Not all players are ready")]
    NotAllReady,
}
