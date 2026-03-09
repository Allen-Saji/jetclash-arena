use bolt_lang::*;
use projectile_pool::ProjectilePool;
use arena_config::ArenaConfig;

declare_id!("58sdUMi9zYfrVGaE7PTYmeSTcF6HyKtP4EoS53JaaV6Z");

const BULLET_HALF_W: i32 = 1500;
const BULLET_HALF_H: i32 = 800;
const ROCKET_HALF_W: i32 = 2500;
const ROCKET_HALF_H: i32 = 1500;

#[system]
pub mod tick_projectiles {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let pool = &mut ctx.accounts.projectile_pool;
        let arena = &ctx.accounts.arena_config;

        for proj in pool.projectiles.iter_mut() {
            if !proj.active { continue; }
            proj.pos_x += proj.vel_x;
            proj.pos_y += proj.vel_y;
            proj.ttl_ticks = proj.ttl_ticks.saturating_sub(1);

            if proj.ttl_ticks == 0
                || proj.pos_x < 0 || proj.pos_x > arena.world_width
                || proj.pos_y < 0 || proj.pos_y > arena.world_height
            {
                proj.active = false;
                continue;
            }

            let (hw, hh) = if proj.is_rocket { (ROCKET_HALF_W, ROCKET_HALF_H) } else { (BULLET_HALF_W, BULLET_HALF_H) };
            for i in 0..(arena.platform_count as usize) {
                let plat = &arena.platforms[i];
                if proj.pos_x + hw > plat.x && proj.pos_x - hw < plat.x + plat.w
                    && proj.pos_y + hh > plat.y && proj.pos_y - hh < plat.y + plat.h
                {
                    proj.active = false;
                    break;
                }
            }
        }

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub projectile_pool: ProjectilePool,
        pub arena_config: ArenaConfig,
    }
}
