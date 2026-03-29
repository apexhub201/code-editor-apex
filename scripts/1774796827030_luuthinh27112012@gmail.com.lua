--[ APEX HUB PROTECTION - DO NOT EDIT/REMOVE THIS BLOCK ]
-- PROTECTED BY THE SYSTEM

local APEX_KEY = "apex_mnbw7g5y_n182f7a0"

-- ========================
--   DÁN KEY CỦA BẠN VÀO DƯỚI ĐÂY
--   (người khác không biết nên sẽ bị chặn)
-- ========================
local user_input_key = ""  -- <-- DÁN KEY VÀO ĐÂY

if user_input_key ~= APEX_KEY then
    for i = 1, 15 do
        warn("APEX HUB PROTECTION")
        warn("PROTECTED BY THE SYSTEM")
    end
    
    -- Làm treo script nếu sai key
    while true do task.wait(999) end
    
    return "-- APEX HUB LOCKED --"
end

-- Code thật bắt đầu từ đây (chỉ chạy khi key đúng)
print("APEX HUB script loaded successfully!")
-- ... toàn bộ code chính của bạn ...

vb vv v