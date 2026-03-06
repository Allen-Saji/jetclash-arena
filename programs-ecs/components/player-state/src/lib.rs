use bolt_lang::*;

declare_id!("SVqcqnh6iqyyUTpzLPpV2zjY2eh96wjDkt8Cvs8feoF");

#[component]
pub struct PlayerState {
    /// The player's wallet pubkey
    pub player_authority: Pubkey,
    /// Fixed-point *100. E.g. x=70000 means 700.00
    pub pos_x: i32,
    pub pos_y: i32,
    pub vel_x: i32,
    pub vel_y: i32,
    pub hp: u8,
    /// Fuel 0-10000 (fixed-point *100, max 100.00)
    pub fuel: u16,
    pub primary_ammo: u8,
    pub secondary_ammo: u8,
    pub facing_right: bool,
    pub is_dead: bool,
    pub is_invincible: bool,
    pub dash_active: bool,
    /// 100 = 1.0x speed
    pub speed_multiplier: u16,
    pub invincible_until_tick: u32,
    pub respawn_at_tick: u32,
    pub dash_cooldown_tick: u32,
    pub primary_cooldown_tick: u32,
    pub secondary_cooldown_tick: u32,
    pub primary_reload_tick: u32,
    pub secondary_reload_tick: u32,
    pub speed_buff_until_tick: u32,
    /// Last input sequence processed (for client prediction reconciliation)
    pub input_seq: u32,
    pub kills: u16,
    pub deaths: u16,
    pub score: u32,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            player_authority: Pubkey::default(),
            pos_x: 0,
            pos_y: 0,
            vel_x: 0,
            vel_y: 0,
            hp: 100,
            fuel: 10000,
            primary_ammo: 50,
            secondary_ammo: 5,
            facing_right: true,
            is_dead: false,
            is_invincible: false,
            dash_active: false,
            speed_multiplier: 100,
            invincible_until_tick: 0,
            respawn_at_tick: 0,
            dash_cooldown_tick: 0,
            primary_cooldown_tick: 0,
            secondary_cooldown_tick: 0,
            primary_reload_tick: 0,
            secondary_reload_tick: 0,
            speed_buff_until_tick: 0,
            input_seq: 0,
            kills: 0,
            deaths: 0,
            score: 0,
        }
    }
}
