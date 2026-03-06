use bolt_lang::*;
use match_state::MatchState;
use player_state::PlayerState;
use pickup_state::PickupState;

declare_id!("6svTwtJNorS61WgrVuBUeJGFZZCniK5zifffikmjZDqQ");

const PICKUP_RANGE_SQ: i64 = 4000 * 4000; // 40px radius squared
const HEALTH_PICKUP_AMOUNT: u8 = 30;
const SPEED_BUFF_MULTIPLIER: u16 = 150;
const SPEED_BUFF_TICKS: u32 = 300;
const PICKUP_RESPAWN_TICKS: u32 = 240;

#[system]
pub mod tick_pickups {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &ctx.accounts.match_state;
        let p1 = &mut ctx.accounts.player_state_p1;
        let p2 = &mut ctx.accounts.player_state_p2;
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

            if !p1.is_dead && dist_sq(p1.pos_x, p1.pos_y, pickup.pos_x, pickup.pos_y) < PICKUP_RANGE_SQ {
                consume_pickup(pickup, p1, tick);
                continue;
            }
            if !p2.is_dead && dist_sq(p2.pos_x, p2.pos_y, pickup.pos_x, pickup.pos_y) < PICKUP_RANGE_SQ {
                consume_pickup(pickup, p2, tick);
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_state_p1: PlayerState,
        pub player_state_p2: PlayerState,
        pub pickup_state: PickupState,
    }
}

fn dist_sq(x1: i32, y1: i32, x2: i32, y2: i32) -> i64 {
    let dx = (x1 - x2) as i64;
    let dy = (y1 - y2) as i64;
    dx * dx + dy * dy
}

fn consume_pickup(pickup: &mut pickup_state::PickupData, player: &mut PlayerState, tick: u32) {
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
