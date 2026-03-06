use bolt_lang::*;
use match_state::MatchState;
use player_state::PlayerState;
use projectile_pool::ProjectilePool;
use pickup_state::PickupState;

declare_id!("4vrZHTpdz97cCtyhbQuAd2XmvipjuyBQGzqfF4SEgrKX");

const MATCH_TICKS: u32 = 3600;

#[derive(serde::Deserialize)]
struct CreateMatchArgs {
    p1_spawn_x: i32,
    p1_spawn_y: i32,
    p2_spawn_x: i32,
    p2_spawn_y: i32,
}

#[system]
pub mod create_match {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: CreateMatchArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let ms = &mut ctx.accounts.match_state;
        ms.tick = 0;
        ms.ticks_remaining = MATCH_TICKS;
        ms.p1_score = 0;
        ms.p1_kills = 0;
        ms.p2_score = 0;
        ms.p2_kills = 0;
        ms.is_active = true;
        ms.winner = 0;

        let p1 = &mut ctx.accounts.player_state_p1;
        p1.pos_x = args.p1_spawn_x;
        p1.pos_y = args.p1_spawn_y;
        reset_player(p1, true);

        let p2 = &mut ctx.accounts.player_state_p2;
        p2.pos_x = args.p2_spawn_x;
        p2.pos_y = args.p2_spawn_y;
        reset_player(p2, false);

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
        pub player_state_p1: PlayerState,
        pub player_state_p2: PlayerState,
        pub projectile_pool: ProjectilePool,
        pub pickup_state: PickupState,
    }
}

fn reset_player(p: &mut PlayerState, facing_right: bool) {
    p.vel_x = 0;
    p.vel_y = 0;
    p.hp = 100;
    p.fuel = 10000;
    p.primary_ammo = 50;
    p.secondary_ammo = 5;
    p.facing_right = facing_right;
    p.is_dead = false;
    p.is_invincible = true;
    p.invincible_until_tick = 90;
    p.dash_active = false;
    p.speed_multiplier = 100;
    p.kills = 0;
    p.deaths = 0;
    p.score = 0;
    p.input_seq = 0;
}
