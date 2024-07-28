local HttpService = game:GetService("HttpService")

-- Replace with your actual endpoint
local playtimeEndpoint = "http://localhost:5000/playtime"
local spendingEndpoint = "http://localhost:5000/playeritem"

local function logPlaytime(player, startTime, totalPlayTime, testType)
	local data = {
		name = player.Name,
		startTime = startTime,
		totalPlayTime = totalPlayTime,
		testType = testType
	}

	local jsonData = HttpService:JSONEncode(data)

	

	HttpService:PostAsync(playtimeEndpoint, jsonData, Enum.HttpContentType.ApplicationJson, false, headers)
end

local function logSpending(player, spendingAmount, spendingTime, testType)
	local data = {
		name = player.Name,
		spendingAmount = spendingAmount,
		spendingTime = spendingTime,
		testType = testType
	}

	local jsonData = HttpService:JSONEncode(data)

	local headers = {
		["Content-Type"] = "application/json"
	}

	HttpService:PostAsync(spendingEndpoint, jsonData, Enum.HttpContentType.ApplicationJson, false, headers)
end

game.Players.PlayerAdded:Connect(function(player)
	local startTime = os.time()
	print(startTime)
	print("hello")
	player:SetAttribute("StartTime", startTime)

	player.AncestryChanged:Connect(function()
		if not player:IsDescendantOf(game) then
			local totalPlayTime = os.time() - player:GetAttribute("StartTime")
			local testType = "A"  -- You can change this as per your test type logic

			logPlaytime(player, startTime, totalPlayTime, testType)
		end
	end)
end)
