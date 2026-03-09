use bolt_lang::*;
use match_state::MatchState;

declare_id!("7nm5gwNyTvCzxQ2VXg5FsXey6f5kfUFwRkmSN8tZ5URx");

#[derive(serde::Deserialize)]
struct ReadyUpArgs {
    player_index: u8,
}

#[system]
pub mod ready_up {

    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let args: ReadyUpArgs = serde_json::from_slice(&args_p)
            .map_err(|_| anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::InstructionDidNotDeserialize))?;

        let ms = &mut ctx.accounts.match_state;

        require!(ms.is_lobby, ErrorReadyUp::NotInLobby);
        require!((args.player_index as usize) < ms.player_count as usize, ErrorReadyUp::InvalidPlayer);

        // Toggle ready bit
        ms.ready_mask ^= 1 << args.player_index;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
    }
}

#[error_code]
pub enum ErrorReadyUp {
    #[msg("Room is not in lobby state")]
    NotInLobby,
    #[msg("Invalid player index")]
    InvalidPlayer,
}
