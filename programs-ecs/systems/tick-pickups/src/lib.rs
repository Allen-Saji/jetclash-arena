use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;
use pickup_state::PickupState;

declare_id!("4XDGJ41VJHB8XcfohkKA5qRPYg14XhrBq1jFQ38TNMYS");

const PICKUP_RANGE_SQ: i64 = 4000 * 4000; // 40px radius squared
const HEALTH_PICKUP_AMOUNT: u8 = 30;
const SPEED_BUFF_MULTIPLIER: u16 = 150;
const SPEED_BUFF_TICKS: u32 = 300;
const PICKUP_RESPAWN_TICKS: u32 = 240;

#[system]
pub mod tick_pickups {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;
        let pickups = &mut ctx.accounts.pickup_state;

        if !ms.is_active { return Ok(ctx.accounts); }
        let tick = ms.tick;

        for pickup in pickups.pickups.iter_mut() {
            if pickup.is_consumed {
                if tick >= pickup.respawn_at_tick {
                    pickup.is_consumed = false;
                }
                continue;
            }

            let mut consumed = false;
            for i in 0..player_pool::MAX_PLAYERS {
                let p = &pool.players[i];
                if !p.is_joined || p.is_dead { continue; }
                if dist_sq(p.pos_x, p.pos_y, pickup.pos_x, pickup.pos_y) < PICKUP_RANGE_SQ {
                    consume_pickup(pickup, &mut pool.players[i], tick);
                    consumed = true;
                    break;
                }
            }
            if consumed { continue; }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
        pub pickup_state: PickupState,
    }
}

fn dist_sq(x1: i32, y1: i32, x2: i32, y2: i32) -> i64 {
    let dx = (x1 - x2) as i64;
    let dy = (y1 - y2) as i64;
    dx * dx + dy * dy
}

fn consume_pickup(pickup: &mut pickup_state::PickupData, player: &mut player_pool::PlayerData, tick: u32) {
    pickup.is_consumed = true;
    pickup.respawn_at_tick = tick + PICKUP_RESPAWN_TICKS;
    match pickup.pickup_type {
        0 => player.hp = (player.hp + HEALTH_PICKUP_AMOUNT).min(100),
        1 => {
            player.speed_multiplier = SPEED_BUFF_MULTIPLIER;
            player.speed_buff_until_tick = tick + SPEED_BUFF_TICKS;
        }
        _ => {}
    }
}
