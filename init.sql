CREATE TABLE Player (
    PlayerId SERIAL PRIMARY KEY,
    Name VARCHAR(255) NOT NULL
);

CREATE TABLE Playtime (
    PlaytimeID SERIAL PRIMARY KEY,
    PlayerId INT REFERENCES Player(PlayerId),
    Total_playTime INT NOT NULL,
    A_or_B VARCHAR(50) NOT NULL
);

CREATE TABLE PlayerItem (
    PlayerItemId SERIAL PRIMARY KEY,
    PlayerId INT REFERENCES Player(PlayerId),
    A_or_B VARCHAR(50) NOT NULL,
    Item_purchase VARCHAR(255) NOT NULL
);
