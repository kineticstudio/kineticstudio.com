export type Award = {
	logo: string;
	logoAlt: string;
	label: string;
	url?: string;
};

export const site = {
	title: "Kinetic Studio",
	description:
		"We craft captivating, award-winning websites and digital experiences for modern brands",
	heroHeading: "Captivating websites that tell compelling stories",
	contactEmail: "hunter@kineticstudio.com",
};

export const awards: Award[] = [
	{
		logo: "/images/Webflow-svg.svg",
		logoAlt: "Webflow logo",
		label: "Webflow Expert Partner",
		url: "https://experts.webflow.com/profile/kinetic-studio",
	},
	{
		logo: "/images/webby.svg",
		logoAlt: "Webby Award logo",
		label: "1 Win — 2 Nominations",
	},
	{
		logo: "/images/awwward.svg",
		logoAlt: "Awwwards logo",
		label: "Site of the Day — 2 Honorable Mentions",
	},
	{
		logo: "/images/sxsw.svg",
		logoAlt: "SXSW logo",
		label: "Interactive Innovation Award Winner",
	},
];
