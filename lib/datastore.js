const Datastore = require('@google-cloud/datastore');

const projectId = '<google-cloud-project-id>';			// TODO: Replace with Google Cloud project id

module.exports.Datastore = Datastore;

module.exports.datastore = new Datastore({projectId:projectId});

module.exports.COURSE = "Course";
module.exports.STUDENT = "Student";
module.exports.USER = "User";
module.exports.PAGINATION_LIMIT = 5;

function getProtocol(req) {
	return (req.hostname === "localhost") ? "http" : "https";
};
module.exports.getProtocol = getProtocol;

module.exports.addIDandSelfLink = function addIDandSelfLink(req, item, item_id) {
    item.id = item_id.toString();
    item.self = getProtocol(req) + "://" + req.get("host") + req.baseUrl + "/" + item.id;
    return item;
};

module.exports.addIDandSelfUserLink = function addIDandSelfUserLink(req, item, item_id) {
    item.id = item_id.toString();
    item.self = getProtocol(req) + "://" + req.get("host") + "/users/" + item.email;
    return item;
};

module.exports.addIDandSelfLinkandCourseOwnerLink = function addIDandSelfLinkandCourseOwnerLink(req, item, item_id) {
    item.id = item_id.toString();
    item.self = getProtocol(req) + "://" + req.get("host") + req.baseUrl + "/" + item.id;
    item.course_owner.self = getProtocol(req) + "://" + req.get("host") + "/users/" + item.course_owner.email;
    return item;
};

module.exports.addIDandSelfLinkandCourseOwnerLinkandStudentCountandRemoveEnrolledStudentsWrapper = function addIDandSelfLinkandCourseOwnerLinkandStudentCountandRemoveEnrolledStudentsWrapper(req) {
	return function(item) {
		item.id = item[Datastore.KEY].id.toString();
		item.self = getProtocol(req) + "://" + req.get("host") + req.baseUrl + "/" + item.id;
		item.total_students_enrolled = item.enrolled_students.length;
		delete item.enrolled_students;
		item.course_owner.self = getProtocol(req) + "://" + req.get("host") + "/users/" + item.course_owner.email;
		return item;
	};
};

module.exports.addStudentLinkWrapper = function addStudentLinkWrapper(req) {
	return function(item) {
	    item.self = getProtocol(req) + "://" + req.get("host") + "/students/" + item.id;
	    return item;
	};
};

module.exports.addCourseLinkWrapper = function addCourseLinkWrapper(req) {
	return function(item) {
	    item.self = getProtocol(req) + "://" + req.get("host") + "/courses/" + item.id;
	    return item;
	};
};

module.exports.addIDandSelfLinkandCourseCountandRemoveScheduleOfCoursesWrapper = function addIDandSelfLinkandCourseCountandRemoveScheduleOfCoursesWrapper(req) {
	return function(item) {
		item.id = item[Datastore.KEY].id.toString();
		item.self = getProtocol(req) + "://" + req.get("host") + req.baseUrl + "/" + item.id;
		item.total_courses_scheduled = item.schedule_of_courses.length;
		delete item.schedule_of_courses;
		return item;
	};
};
