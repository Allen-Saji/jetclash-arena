use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;

declare_id!("uznR74kSGF5g4rXg6BU7xA5mwA1NaSZUyQuctwcsQxY");

#[derive(serde::Deserialize)]
struct JoinMatchArgs {
    player_authority: [u8; 32],
    character_id: u8,
}

#[system]
pub mod join_match {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: JoinMatchArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let ms = &mut ctx.accounts.match_state;
        let pool = &mut ctx.accounts.player_pool;

        require!(ms.is_lobby, ErrorJoinMatch::NotInLobby);
        require!(!ms.is_active, ErrorJoinMatch::MatchAlreadyActive);
        require!((ms.player_count as usize) < match_state::MAX_PLAYERS, ErrorJoinMatch::RoomFull);

        let player_pubkey = Pubkey::new_from_array(args.player_authority);

        // Check not already joined
        for i in 0..(ms.player_count as usize) {
            require!(ms.players[i] != player_pubkey, ErrorJoinMatch::AlreadyJoined);
        }

        let idx = ms.player_count as usize;
        ms.players[idx] = player_pubkey;
        ms.player_count += 1;

        // Initialize player slot
        let p = &mut pool.players[idx];
        p.player_index = idx as u8;
        p.is_joined = true;
        p.character_id = args.character_id;
        p.hp = 100;
        p.fuel = 10000;
        p.primary_ammo = 50;
        p.secondary_ammo = 5;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
    }
}

#[error_code]
pub enum ErrorJoinMatch {
    #[msg("Room is not in lobby state")]
    NotInLobby,
    #[msg("Match is already active")]
    MatchAlreadyActive,
    #[msg("Room is full (max 4 players)")]
    RoomFull,
    #[msg("Player already joined this room")]
    AlreadyJoined,
}
