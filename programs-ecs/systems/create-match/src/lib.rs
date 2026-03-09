use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;
use projectile_pool::ProjectilePool;
use pickup_state::PickupState;

declare_id!("57jUShxEaZPCx5jHtCA2rrXbxXhoEG2gVvAKezmaEV1g");

#[derive(serde::Deserialize)]
struct CreateMatchArgs {
    host_authority: [u8; 32],
    character_id: u8,
    min_players: u8,
}

#[system]
pub mod create_match {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: CreateMatchArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let host_pubkey = Pubkey::new_from_array(args.host_authority);
        let min_p = if args.min_players < 2 { 2 } else { args.min_players.min(4) };

        let ms = &mut ctx.accounts.match_state;
        ms.players[0] = host_pubkey;
        ms.player_count = 1;
        ms.min_players = min_p;
        ms.is_lobby = true;
        ms.is_active = false;
        ms.ready_mask = 0;
        ms.tick = 0;
        ms.ticks_remaining = 3600;
        ms.winner = 0;

        // Auto-join host as player 0
        let p = &mut ctx.accounts.player_pool.players[0];
        p.player_index = 0;
        p.is_joined = true;
        p.character_id = args.character_id;
        p.hp = 100;
        p.fuel = 10000;
        p.primary_ammo = 50;
        p.secondary_ammo = 5;
        p.facing_right = true;
        p.is_dead = false;
        p.kills = 0;
        p.deaths = 0;
        p.score = 0;

        // Clear other player slots
        for i in 1..player_pool::MAX_PLAYERS {
            ctx.accounts.player_pool.players[i] = player_pool::PlayerData::default();
        }

        for proj in ctx.accounts.projectile_pool.projectiles.iter_mut() {
            proj.active = false;
        }

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
