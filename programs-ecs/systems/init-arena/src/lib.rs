use bolt_lang::*;
use arena_config::ArenaConfig;
use pickup_state::PickupState;

declare_id!("5FDD7CHTMqtdZzQKykJxhFEU7r7UFCGkVnSt1jGWp63v");

#[derive(serde::Deserialize)]
struct ArenaInitArgs {
    platforms: Vec<PlatformInit>,
    spawn_points: Vec<PointInit>,
    pickup_positions: Vec<PickupInit>,
    world_width: i32,
    world_height: i32,
    gravity: i32,
}

#[derive(serde::Deserialize)]
struct PlatformInit { x: i32, y: i32, w: i32, h: i32 }

#[derive(serde::Deserialize)]
struct PointInit { x: i32, y: i32 }

#[derive(serde::Deserialize)]
struct PickupInit { x: i32, y: i32, pickup_type: u8 }

#[system]
pub mod init_arena {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: ArenaInitArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let arena = &mut ctx.accounts.arena_config;
        arena.world_width = args.world_width;
        arena.world_height = args.world_height;
        arena.gravity = args.gravity;

        let plat_count = args.platforms.len().min(arena_config::MAX_PLATFORMS);
        arena.platform_count = plat_count as u8;
        for (i, p) in args.platforms.iter().enumerate().take(plat_count) {
            arena.platforms[i].x = p.x;
            arena.platforms[i].y = p.y;
            arena.platforms[i].w = p.w;
            arena.platforms[i].h = p.h;
        }

        let spawn_count = args.spawn_points.len().min(arena_config::MAX_SPAWN_POINTS);
        arena.spawn_point_count = spawn_count as u8;
        for (i, s) in args.spawn_points.iter().enumerate().take(spawn_count) {
            arena.spawn_points[i].x = s.x;
            arena.spawn_points[i].y = s.y;
        }

        let pickup_count = args.pickup_positions.len().min(arena_config::MAX_PICKUP_POSITIONS);
        arena.pickup_position_count = pickup_count as u8;
        for (i, pk) in args.pickup_positions.iter().enumerate().take(pickup_count) {
            arena.pickup_positions[i].x = pk.x;
            arena.pickup_positions[i].y = pk.y;
        }

        let pickups = &mut ctx.accounts.pickup_state;
        for (i, pk) in args.pickup_positions.iter().enumerate().take(pickup_count) {
            pickups.pickups[i].pos_x = pk.x;
            pickups.pickups[i].pos_y = pk.y;
            pickups.pickups[i].pickup_type = pk.pickup_type;
            pickups.pickups[i].is_consumed = false;
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub arena_config: ArenaConfig,
        pub pickup_state: PickupState,
    }
}
