use bolt_lang::*;

declare_id!("7UHeP4BPqSjfsgcezw3M64TSQYi4BaaWhwH1PkEX96eB");

/// Axis-Aligned Bounding Box for platform collision
#[component_deserialize]
pub struct AABB {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Default for AABB {
    fn default() -> Self {
        Self { x: 0, y: 0, w: 0, h: 0 }
    }
}

#[component_deserialize]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Default for Point {
    fn default() -> Self {
        Self { x: 0, y: 0 }
    }
}

pub const MAX_PLATFORMS: usize = 10;
pub const MAX_SPAWN_POINTS: usize = 5;
pub const MAX_PICKUP_POSITIONS: usize = 5;

#[component]
pub struct ArenaConfig {
    pub platforms: [AABB; MAX_PLATFORMS],
    pub platform_count: u8,
    pub spawn_points: [Point; MAX_SPAWN_POINTS],
    pub spawn_point_count: u8,
    pub pickup_positions: [Point; MAX_PICKUP_POSITIONS],
    pub pickup_position_count: u8,
    pub world_width: i32,
    pub world_height: i32,
    pub gravity: i32,
}

impl Default for ArenaConfig {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            platforms: [AABB::default(); MAX_PLATFORMS],
            platform_count: 0,
            spawn_points: [Point::default(); MAX_SPAWN_POINTS],
            spawn_point_count: 0,
            pickup_positions: [Point::default(); MAX_PICKUP_POSITIONS],
            pickup_position_count: 0,
            world_width: 256000,
            world_height: 144000,
            gravity: 80000,
        }
    }
}
