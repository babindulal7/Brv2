-- =============================================================================
-- 0123_categorize_equipment_inventory.sql
-- Populate missing inventory_categories and re-categorize the 204 products
-- from the monolithic 'Camera' assignment into proper industry categories.
-- =============================================================================

-- 1. Insert missing 11 product categories into inventory_categories
insert into inventory_categories (id, client_uuid, code, name, description, sort_order, is_active)
values
  ('00000000-0000-0000-0000-000000000507'::uuid, '20000000-0000-0000-0000-000000000507'::uuid, 'drone', 'Drone'::product_category, 'Drones & Aerial Systems', 7, true),
  ('00000000-0000-0000-0000-000000000508'::uuid, '20000000-0000-0000-0000-000000000508'::uuid, 'monitor', 'Monitor'::product_category, 'Production, Director & On-Camera Monitors', 8, true),
  ('00000000-0000-0000-0000-000000000509'::uuid, '20000000-0000-0000-0000-000000000509'::uuid, 'power', 'Power'::product_category, 'V-Mount Batteries, Chargers & Power Stations', 9, true),
  ('00000000-0000-0000-0000-000000000510'::uuid, '20000000-0000-0000-0000-000000000510'::uuid, 'media', 'Media'::product_category, 'Memory Cards, SSDs & Card Readers', 10, true),
  ('00000000-0000-0000-0000-000000000511'::uuid, '20000000-0000-0000-0000-000000000511'::uuid, 'computing', 'Computing'::product_category, 'DIT Stations, Laptops & Video Switchers', 11, true),
  ('00000000-0000-0000-0000-000000000512'::uuid, '20000000-0000-0000-0000-000000000512'::uuid, 'case', 'Case'::product_category, 'Hard Cases & Flight Cases', 12, true),
  ('00000000-0000-0000-0000-000000000513'::uuid, '20000000-0000-0000-0000-000000000513'::uuid, 'bag', 'Bag'::product_category, 'Soft Bags, Backpacks & Pouches', 13, true),
  ('00000000-0000-0000-0000-000000000514'::uuid, '20000000-0000-0000-0000-000000000514'::uuid, 'accessory', 'Accessory'::product_category, 'Cables, Adapters, Matte Boxes, Follow Focus & Rigging', 14, true),
  ('00000000-0000-0000-0000-000000000515'::uuid, '20000000-0000-0000-0000-000000000515'::uuid, 'consumable', 'Consumable'::product_category, 'Gaffer Tape, Gels & Expendables', 15, true),
  ('00000000-0000-0000-0000-000000000516'::uuid, '20000000-0000-0000-0000-000000000516'::uuid, 'vehicle', 'Vehicle'::product_category, 'Production Vans, Trucks & Vehicles', 16, true),
  ('00000000-0000-0000-0000-000000000517'::uuid, '20000000-0000-0000-0000-000000000517'::uuid, 'other', 'Other'::product_category, 'Crew Services & Miscellaneous Equipment', 17, true)
on conflict (code) do nothing;

-- 2. Update products category_id to point to the correct category
-- CAMERA (12 products)
update products
set category_id = (select id from inventory_categories where code = 'camera')
where asset_code in (
  'EQ000065' -- DJI Osmo Pocket 3 ,
  'EQ000066' -- DJI Ronin 4D 6K 4-Axis Cinema Camera System (Body Only),
  'EQ000097' -- Insta360 X5 8K 360° Action Camera,
  'EQ000128' -- RED KOMODO 6K Cinema Camera (Body Only),
  'EQ000129' -- RED Komodo X 6k Cinema Camera (Body Only),
  'EQ000130' -- RED V-Raptor 8K VV Cinema Camera (Body Only),
  'EQ000185' -- Sony A7 IV Mirrorless Camera (Body Only),
  'EQ000186' -- Sony A7S III Mirrorless Camera (Body Only),
  'EQ000189' -- Sony BURANO 8K Digital Cinema Camera (Body Only),
  'EQ000191' -- Sony FX3 Cinema Line Camera (Body Only),
  'EQ000192' -- Sony FX30 Cinema Line Camera (Body Only),
  'EQ000193' -- Sony FX6 Cinema Camera (Body Only)
);

-- LENS (30 products)
update products
set category_id = (select id from inventory_categories where code = 'lens')
where asset_code in (
  'EQ000008' -- 7Artisans 37mm Lens,
  'EQ000009' -- 7Artisans 57mm Lens,
  'EQ000035' -- Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL) ,
  'EQ000036' -- BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL),
  'EQ000049' -- CHIOPT XTREME Zoom Lens 28–85mm T3.2,
  'EQ000050' -- CHIOPT XTREME Zoom Lens 75–250mm T3.2,
  'EQ000088' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 35mm,
  'EQ000089' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 50mm,
  'EQ000090' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 85mm,
  'EQ000112' -- Meike Full Frame lens set (PL Mount),
  'EQ000113' -- NiSi ATHENA PRIME Cinema Lens Series,
  'EQ000157' -- Sigma 14-24mm f/2.8 DG DN Art Lens (E mount),
  'EQ000158' -- Sigma 24-70mm f/2.8 DG DN II Art Lens for Sony E,
  'EQ000159' -- Sigma 28-45mm F1.8 DG DN Art Lens for Sony E,
  'EQ000160' -- Sigma 28-70mm f/2.8 DG DN Contemporary Lens (E mount),
  'EQ000163' -- Sirui 24mm f/2.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000164' -- Sirui 35mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000165' -- Sirui 50mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000166' -- Sirui 75mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000167' -- Sirui Anamorphic Lens Set (24/35/50/75mm) E-Mount,
  'EQ000175' -- Sony 16-35mm f/2.8 GM Lens,
  'EQ000176' -- Sony 200-600mm f/5.6-6.3 G OSS Lens,
  'EQ000177' -- Sony 24-70mm f/2.8 GM II Lens,
  'EQ000178' -- Sony 24-70mm f/2.8 GM Lens,
  'EQ000179' -- Sony 24-105mm f/4 G OSS Lens,
  'EQ000180' -- Sony 35mm f/1.4 GM Lens,
  'EQ000181' -- Sony 50mm f/1.2 GM Lens,
  'EQ000182' -- Sony 70-200mm f/2.8 GM OSS II Lens,
  'EQ000183' -- Sony 85mm f/1.4 GM Lens,
  'EQ000184' -- Sony 90mm f/2.8 Macro G OSS Lens
);

-- LIGHTING (16 products)
update products
set category_id = (select id from inventory_categories where code = 'lighting')
where asset_code in (
  'EQ000005' -- 5 in 1 Folded Reflector,
  'EQ000019' -- Amaran 200d S LED Video Light,
  'EQ000020' -- Amaran 300c ,
  'EQ000021' -- Amaran 60d S,
  'EQ000022' -- Amaran F22c Light,
  'EQ000023' -- Amaran PT2c RGBWW LED Pixel Tube Light,
  'EQ000024' -- Amaran PT4c RGBWW LED Pixel Tube Light,
  'EQ000025' -- Amaran T2C RGBWW LED Tube Light 25W (2ft),
  'EQ000026' -- Amaran T4C RGBWW LED Tube Light,
  'EQ000028' -- Aperture LS 1200x light,
  'EQ000029' -- Aperture LS 600x light,
  'EQ000030' -- Aputure 400x,
  'EQ000031' -- Aputure MC Pro RGB LED Light Panel (Production 8-Light Kit),
  'EQ000083' -- Godox RS60R Kit 2 RGB LED Video Light (2-Light Kit),
  'EQ000087' -- Godox V860III Flash for Sony,
  'EQ000111' -- Mc pro light
);

-- AUDIO (18 products)
update products
set category_id = (select id from inventory_categories where code = 'audio')
where asset_code in (
  'EQ000017' -- Accsoon CoMo 7/9-Set Headset Intercom - 9,
  'EQ000018' -- Accsoon CoMo SE 5-Person Intercom System (Grade B),
  'EQ000064' -- Dji Mic Mini,
  'EQ000084' -- Godox SkyTalk Air intercom system - 3 set,
  'EQ000085' -- Godox SkyTalk Air intercom system - 4 set,
  'EQ000086' -- Godox SkyTalk Air intercom system - 5 set,
  'EQ000094' -- Hollyland 8 person comset,
  'EQ000132' -- Rode Lavalier Go Microphone,
  'EQ000133' -- Rode Mic pro plus,
  'EQ000134' -- Rode NTG4+ Shotgun Microphone,
  'EQ000135' -- Rode Wireless go 2 (single),
  'EQ000136' -- Rode Wireless GO II Dual Kit,
  'EQ000137' -- Rode wireless pro,
  'EQ000142' -- Samson dynamic mic Q2U,
  'EQ000154' -- Sennheiser EW 100 G4 Wireless Microphone System,
  'EQ000155' -- Sennheiser MKE 600 Shotgun Microphone,
  'EQ000190' -- Sony ECM-VG1 Shotgun Microphone,
  'EQ000196' -- Sony UWP-D21 Wireless Lavalier Microphone System
);

-- GRIP (21 products)
update products
set category_id = (select id from inventory_categories where code = 'grip')
where asset_code in (
  'EQ000001' -- 10x10 Skimmer Frame and Cloth ,
  'EQ000002' -- 12x12 Skimmer and Cloth,
  'EQ000003' -- 20x20 skimmer cloth (BLACK),
  'EQ000006' -- 6x6 Skimmer Frame and cloth,
  'EQ000010' -- 8x8 Skimmer Frame and Cloth,
  'EQ000034' -- Baby boom stand,
  'EQ000042' -- Came TV Hydraulic Suspension Car Rig,
  'EQ000052' -- C stand  - Cstand Flag set,
  'EQ000053' -- C stand  - Double height ,
  'EQ000054' -- C stand  - Triple height ,
  'EQ000091' -- Grip Head,
  'EQ000098' -- JF DigitalFoto IRON-C100S + IRON-C100G Magic Arm & Super Clamp Combo Kit,
  'EQ000100' -- Jumbo Stand  - Double Height ,
  'EQ000101' -- Jumbo Stand  - Triple Height ,
  'EQ000117' -- NSH CX-10 Electric Suction Cup Shooting System Car Photography Suction Cup Car Shooting,
  'EQ000118' -- Openmoon Saddle Bag,
  'EQ000139' -- Roller Stand  - Double Height ,
  'EQ000140' -- Roller Stand  - Triple Height ,
  'EQ000141' -- Safety Pin,
  'EQ000143' -- Sand Bag,
  'EQ000173' -- SmallRig Super Clamp
);

-- SUPPORT (14 products)
update products
set category_id = (select id from inventory_categories where code = 'support')
where asset_code in (
  'EQ000055' -- Dana Dolly NS-50 Slider System,
  'EQ000068' -- DJI RS 3 Gimbal,
  'EQ000069' -- DJI RS 4 Pro,
  'EQ000070' -- DJI RS 5 / RS 5 Combo - DJI RS 5,
  'EQ000071' -- DJI RS 5 / RS 5 Combo - DJI RS 5 Combo,
  'EQ000075' -- Easy rig,
  'EQ000076' -- Easyrig minimax,
  'EQ000077' -- E image 3 gear tripod,
  'EQ000104' -- K&F Concept VA3 Heavy-Duty Aluminum Tripod with BV20 Fluid Head,
  'EQ000109' -- Libec Tripod,
  'EQ000168' -- Sirui SVT75 Pro Carbon Fiber Tripod with SVH15 Fluid Head,
  'EQ000169' -- Slider 3ft Proaim,
  'EQ000201' -- X jib (scissor jib),
  'EQ000202' -- Yunteng Tripod Small
);

-- MONITOR (15 products)
update products
set category_id = (select id from inventory_categories where code = 'monitor')
where asset_code in (
  'EQ000013' -- Accsoon CineView M7 Pro 7" monitor (built in wireless),
  'EQ000033' -- Atomos Ninja V+ Kit,
  'EQ000056' -- Desview Blade 5 Pro,
  'EQ000057' -- Desview OLED Director Monitor  - 14 Inch,
  'EQ000058' -- Desview OLED Director Monitor  - 16 Inch,
  'EQ000059' -- Desview S14-HDR 14″ Director Monitor Kit (Wireless Video + V-Mount Battery),
  'EQ000060' -- Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") - Desview S14-HDR 14″,
  'EQ000061' -- Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") -  PortKeys 8″ Monitor,
  'EQ000063' -- Dji High Bright Monitor,
  'EQ000079' -- Feelworld 5.5-inch Monitor,
  'EQ000121' -- Portkeys BM5 III WR 5.5" Touchscreen Monitor,
  'EQ000122' -- Portkeys HS8 8-inch Monitor,
  'EQ000123' -- Portkeys LEYE SDI Electronic View Finder,
  'EQ000156' -- Shimbol Memory I Pro 5.5-inch Monitor,
  'EQ000203' -- Zacuto Kameleon EVF - View Finder
);

-- POWER (18 products)
update products
set category_id = (select id from inventory_categories where code = 'power')
where asset_code in (
  'EQ000012' -- 99Whr Vmount battery,
  'EQ000073' -- D-tap Charger,
  'EQ000074' -- D tap to 12v DC cable,
  'EQ000078' -- FB 310Whr Vmount battery,
  'EQ000096' -- Honda EU22i Inverter Generator (2200VA),
  'EQ000105' -- K&F NP-F550 Battery,
  'EQ000116' -- NP-F 3-Way Battery Adapter,
  'EQ000119' -- PECRON F3000LFP Portable Power Station 3600W 3072Wh,
  'EQ000120' -- PECRON PV200 Portable Solar Panel (200W) x2,
  'EQ000124' -- Power Bank 65W 30000 mAh Baseus,
  'EQ000125' -- Power Strip (Socket),
  'EQ000170' -- Smallrig mini v-mount battery 50Wh,
  'EQ000171' -- Smallrig mini v-mount battery 99Wh,
  'EQ000174' -- SmallRig V-Mount Battery Adapter Plate,
  'EQ000187' -- Sony BP-U35 Battery,
  'EQ000188' -- Sony BP-U70 Battery,
  'EQ000194' -- Sony NP-FZ100 Battery,
  'EQ000204' -- ZGCINE NP-FZ100 Battery Box
);

-- MEDIA (17 products)
update products
set category_id = (select id from inventory_categories where code = 'media')
where asset_code in (
  'EQ000027' -- Angelbird 1TB AV PRO SE CFexpress v4 Type B Memory Card,
  'EQ000044' -- CFast 512GB Memory Card (RED),
  'EQ000045' -- CFast Card Reader,
  'EQ000046' -- CFexpress Type B 1TB card (RED),
  'EQ000047' -- CF express Type B Card Reader ,
  'EQ000048' -- CFexpress Type B Card Reader,
  'EQ000106' -- Lexar CFexpress Type A Professional Memory Card - 160GB,
  'EQ000107' -- Lexar CFexpress Type A Professional Memory Card - 320GB,
  'EQ000108' -- Lexar CFexpress Type A Professional Memory Card - 512 GB,
  'EQ000144' -- SanDisk 128GB Extreme PRO UHS-II SDXC Memory Card,
  'EQ000145' -- SanDisk 128GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000146' -- SanDisk 256GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000147' -- SanDisk 64GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000148' -- SanDisk Professional PRO-BLADE STATION 4-Bay NVMe Enclosure,
  'EQ000149' -- SanDisk PRO-BLADE TRANSPORT 1TB Portable NVMe SSD,
  'EQ000150' -- SD Card Reader,
  'EQ000195' -- Sony TOUGH 160GB CFexpress Type A Memory Card
);

-- COMPUTING (1 products)
update products
set category_id = (select id from inventory_categories where code = 'computing')
where asset_code in (
  'EQ000138' -- Roland V-1HD 4x HDMI input Video Switcher
);

-- ACCESSORY (32 products)
update products
set category_id = (select id from inventory_categories where code = 'accessory')
where asset_code in (
  'EQ000004' -- 58mm Nd,
  'EQ000007' -- 77mm Close-Up Filter,
  'EQ000011' -- 95mm Polarizer Filter for Tilta Mirage,
  'EQ000014' -- Accsoon Cineview Nano,
  'EQ000015' -- Accsoon cineview Sdi 2,
  'EQ000016' -- Accsoon Cineviw SDI 2 Transmitter(TX),
  'EQ000032' -- Arm Rod,
  'EQ000043' -- Canon Mount Adapter EF-EOS R,
  'EQ000051' -- Clap Board,
  'EQ000062' -- Dji Focus pro with Lidar,
  'EQ000067' -- DJI Ronin 4D Flex Cable ,
  'EQ000072' -- DJI SDR TRANSMISSION COMBO,
  'EQ000092' -- HDMI to HDMI Cable (SmallRig) - 35cm,
  'EQ000093' -- HDMI to HDMI Cable (SmallRig) - 55cm,
  'EQ000095' -- Hollyland cosmo C1 wireless video transmitter,
  'EQ000102' -- K&F CONCEPT NANO-X Series Filter VARIABLE ND4-32  - 67mm,
  'EQ000103' -- K&F CONCEPT NANO-X Series Filter VARIABLE ND4-32  - 72mm,
  'EQ000114' -- NiSi Cinema 4×5.65″ True Color Polariser Filter,
  'EQ000115' -- NiSi PL to E-Mount Adapter,
  'EQ000126' -- Proaim 7" Monitor Cage with Sunhood,
  'EQ000127' -- Proaim 9" Director Monitor Cage with Sunhood,
  'EQ000131' -- RF to PL Adapter,
  'EQ000151' -- SDI Cable - 15m,
  'EQ000152' -- SDI Cable - 20m,
  'EQ000153' -- SDI Cable - 55cm,
  'EQ000161' -- Sigma MC-11 EF to E-Mount Adapter,
  'EQ000162' -- Simmod EF to L Mount Adapter,
  'EQ000172' -- Smallrig Quick Release Plate for Manfrotto,
  'EQ000197' -- Tilta Mirage Matte Box,
  'EQ000198' -- Tilta Mirage VND Motorized Kit,
  'EQ000199' -- Tilta Nucleus-M Wireless Follow Focus Kit,
  'EQ000200' -- Tilta Nucleus-Nano II Wireless Lens Control System
);

-- OTHER (10 products)
update products
set category_id = (select id from inventory_categories where code = 'other')
where asset_code in (
  'EQ000037' -- Camera Caretaker ,
  'EQ000038' -- Camera Caretaker - Contact no. 9712052572 (Sunil Lama),
  'EQ000039' -- Camera Caretaker - Contact no. 9712052574 (Aryan Chaudhary),
  'EQ000040' -- Camera Caretaker - Contact no. 9748249945 (Shisir Parkhi),
  'EQ000041' -- Camera Caretaker - Contact no. 9820418147 (Pratik Puri),
  'EQ000080' -- Fog Machine  - 1300 Watt,
  'EQ000081' -- Fog Machine  - 1500 Watt,
  'EQ000082' -- Fog Machine  - 1800 Watt,
  'EQ000099' -- Jib Operator ,
  'EQ000110' -- Light Man 
);

